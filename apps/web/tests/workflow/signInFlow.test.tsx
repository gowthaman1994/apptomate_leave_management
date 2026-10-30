import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import App from "../../src/App";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const SUCCESS_BODY = {
  access_token: "access-token",
  refresh_token: "refresh-token",
  token_type: "bearer",
  expires_in: 900,
};

const INVALID_CREDENTIALS_BODY = { detail: "Invalid email or password." };
const INVALID_CREDENTIALS_MESSAGE = "Check your email and password and try again.";
const GENERIC_MESSAGE = "Something went wrong. Please try again.";
const UNREACHABLE_MESSAGE = "Can't reach the server. Check your connection and try again.";

async function submit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/email/i), "person@example.com");
  await user.type(screen.getByLabelText(/password/i), "correct-password");
  await user.click(screen.getByRole("button", { name: /sign in/i }));
}

describe("sign-in workflow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // sonner's toast queue lives in a module-level store outside the React
    // tree, so toasts from a previous test can otherwise leak into the next
    // one even with a freshly mounted <Toaster/>.
    toast.dismiss();
  });

  it("signs in successfully and shows the authenticated placeholder", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(SUCCESS_BODY, 200));

    render(<App />);

    await user.type(screen.getByLabelText(/email/i), "person@example.com");
    await user.type(screen.getByLabelText(/password/i), "correct-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/person@example\.com/i)).toBeInTheDocument();
    });
  });

  it("prevents a duplicate request while sign-in is pending", async () => {
    const user = userEvent.setup();
    let resolveFetch!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockReturnValue(pending);

    render(<App />);

    await user.type(screen.getByLabelText(/email/i), "person@example.com");
    await user.type(screen.getByLabelText(/password/i), "correct-password");

    const button = screen.getByRole("button", { name: /sign in/i });
    await user.click(button);
    await user.click(button);

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    resolveFetch(jsonResponse(SUCCESS_BODY, 200));
    await waitFor(() => {
      expect(screen.getByText(/person@example\.com/i)).toBeInTheDocument();
    });
  });

  it("shows the identical 401 message regardless of what the backend body contains", async () => {
    // The backend already guarantees wrong-password and unknown-account return the
    // byte-identical body (feature 001); this confirms the frontend's mapping only
    // keys off the status code, never the body, so it can't accidentally leak a
    // distinction the backend didn't make.
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(INVALID_CREDENTIALS_BODY, 401));

    render(<App />);
    await submit(user);

    expect(await screen.findByText(INVALID_CREDENTIALS_MESSAGE)).toBeInTheDocument();
  });

  it("shows the generic message for a 422 response", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(undefined, 422));

    render(<App />);
    await submit(user);

    expect(await screen.findByText(GENERIC_MESSAGE)).toBeInTheDocument();
  });

  it("shows the unreachable message when the request fails outright", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    render(<App />);
    await submit(user);

    expect(await screen.findByText(UNREACHABLE_MESSAGE)).toBeInTheDocument();
  });

  it("shows no leftover failure toast after a later successful sign-in", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(INVALID_CREDENTIALS_BODY, 401));

    render(<App />);
    await submit(user);
    expect(await screen.findByText(INVALID_CREDENTIALS_MESSAGE)).toBeInTheDocument();

    fetchSpy.mockResolvedValueOnce(jsonResponse(SUCCESS_BODY, 200));
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/person@example\.com/i)).toBeInTheDocument();
    });
    // sonner animates a dismissed toast out rather than removing it from the
    // DOM instantly, so give that transition time to finish rather than
    // asserting absence on the very first tick after success.
    await waitFor(() => {
      expect(screen.queryAllByText(INVALID_CREDENTIALS_MESSAGE)).toHaveLength(0);
    });
  });
});
