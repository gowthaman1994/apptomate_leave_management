import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider } from "../../src/features/auth/AuthContext";
import { SignInForm } from "../../src/features/auth/SignInForm";

const EMAIL_ERROR = "Enter a valid email address.";
const PASSWORD_ERROR = "Enter your password.";

function renderForm() {
  return render(
    <AuthProvider>
      <SignInForm />
    </AuthProvider>,
  );
}

describe("SignInForm validation", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  it("shows an email error and sends no request on an empty email", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/password/i), "a-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(EMAIL_ERROR)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows an email error and sends no request on a malformed email", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/email/i), "not-an-email");
    await user.type(screen.getByLabelText(/password/i), "a-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(EMAIL_ERROR)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows a password error and sends no request on an empty password", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/email/i), "person@example.com");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(PASSWORD_ERROR)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("clears the email error once the field is corrected", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/password/i), "a-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByText(EMAIL_ERROR)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/email/i), "person@example.com");

    expect(screen.queryByText(EMAIL_ERROR)).not.toBeInTheDocument();
  });
});
