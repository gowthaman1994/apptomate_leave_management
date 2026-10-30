import type { LoginFailure } from "./api";

const INVALID_CREDENTIALS_MESSAGE = "Check your email and password and try again.";
const GENERIC_MESSAGE = "Something went wrong. Please try again.";
const UNREACHABLE_MESSAGE = "Can't reach the server. Check your connection and try again.";

export type LoginFailureInput = LoginFailure | { kind: "network" };

/**
 * Maps a failed login() outcome to the exact toast text, per
 * contracts/auth-integration.md's table. Keys off status only — never the
 * response body — so unknown-account and wrong-password stay indistinguishable
 * (SC-005), matching the backend's own guarantee.
 */
export function mapLoginFailureToToast(input: LoginFailureInput): string {
  if ("kind" in input) {
    return UNREACHABLE_MESSAGE;
  }
  if (input.status === 401) {
    return INVALID_CREDENTIALS_MESSAGE;
  }
  return GENERIC_MESSAGE;
}
