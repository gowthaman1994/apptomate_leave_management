const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Email is required after trimming and must match a standard email-address
 * format (data-model.md's Sign-In Credentials rules).
 */
export function validateEmail(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed === "" || !EMAIL_PATTERN.test(trimmed)) {
    return "Enter a valid email address.";
  }
  return undefined;
}

/**
 * Password is required after trimming for the presence check only — the
 * value itself is never trimmed before being sent (data-model.md).
 */
export function validatePassword(value: string): string | undefined {
  if (value.trim() === "") {
    return "Enter your password.";
  }
  return undefined;
}
