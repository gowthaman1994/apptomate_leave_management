import { describe, expect, it } from "vitest";
import { mapLoginFailureToToast } from "../../src/features/auth/errors";

const INVALID_CREDENTIALS_MESSAGE = "Check your email and password and try again.";
const GENERIC_MESSAGE = "Something went wrong. Please try again.";
const UNREACHABLE_MESSAGE = "Can't reach the server. Check your connection and try again.";

describe("mapLoginFailureToToast", () => {
  it("maps a 401 to the generic credentials message", () => {
    expect(
      mapLoginFailureToToast({ ok: false, status: 401, body: { detail: "Invalid email or password." } }),
    ).toBe(INVALID_CREDENTIALS_MESSAGE);
  });

  it("maps a 400 (malformed/undecryptable body) to the generic fallback", () => {
    expect(mapLoginFailureToToast({ ok: false, status: 400, body: undefined })).toBe(
      GENERIC_MESSAGE,
    );
  });

  it("maps a 422 (validation failure) to the generic fallback", () => {
    expect(mapLoginFailureToToast({ ok: false, status: 422, body: undefined })).toBe(
      GENERIC_MESSAGE,
    );
  });

  it("maps a network failure to the unreachable message", () => {
    expect(mapLoginFailureToToast({ kind: "network" })).toBe(UNREACHABLE_MESSAGE);
  });

  it("maps any other unrecognized status to the generic fallback", () => {
    expect(mapLoginFailureToToast({ ok: false, status: 503, body: undefined })).toBe(
      GENERIC_MESSAGE,
    );
  });
});
