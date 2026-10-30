import { describe, expect, it } from "vitest";
import { validateEmail, validatePassword } from "../../src/features/auth/validation";

describe("validateEmail", () => {
  it("rejects an empty value", () => {
    expect(validateEmail("")).toBeDefined();
  });

  it("rejects a whitespace-only value", () => {
    expect(validateEmail("   ")).toBeDefined();
  });

  it("rejects a malformed address", () => {
    expect(validateEmail("not-an-email")).toBeDefined();
  });

  it("accepts a valid address", () => {
    expect(validateEmail("person@example.com")).toBeUndefined();
  });

  it("accepts a valid address with surrounding whitespace (trimmed before checking)", () => {
    expect(validateEmail("  person@example.com  ")).toBeUndefined();
  });
});

describe("validatePassword", () => {
  it("rejects an empty value", () => {
    expect(validatePassword("")).toBeDefined();
  });

  it("rejects a whitespace-only value", () => {
    expect(validatePassword("   ")).toBeDefined();
  });

  it("accepts any non-empty value, including one with internal whitespace", () => {
    expect(validatePassword(" correct password ")).toBeUndefined();
  });
});
