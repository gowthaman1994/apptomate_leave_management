import { describe, expect, it } from "vitest";
import { encodeFernetToken } from "../../src/lib/fernet";

const TEST_KEY = "yQM0tPRqNhqfGbAwK0HZz0xWAkzwIYiTI4zI2S1Qg4A=";

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

describe("encodeFernetToken", () => {
  it("produces a token whose decoded bytes start with the Fernet version byte", async () => {
    const result = await encodeFernetToken(TEST_KEY, { a: 1 });
    const tokenStr = new TextDecoder().decode(result);
    const decoded = base64UrlDecode(tokenStr);
    expect(decoded[0]).toBe(0x80);
  });

  it("has the expected total length for a given plaintext length", async () => {
    // layout: 1 (version) + 8 (timestamp) + 16 (iv) + ciphertext + 32 (hmac)
    // AES-CBC with PKCS7 padding: ciphertext length = plaintext rounded up to
    // the next multiple of 16, always padding even on an exact multiple.
    const payload = { email: "a@example.com", password: "secret" };
    const plaintextLength = new TextEncoder().encode(JSON.stringify(payload)).length;
    const expectedCiphertextLength =
      Math.floor(plaintextLength / 16) * 16 + 16;
    const expectedDecodedLength = 1 + 8 + 16 + expectedCiphertextLength + 32;

    const result = await encodeFernetToken(TEST_KEY, payload);
    const tokenStr = new TextDecoder().decode(result);
    const decoded = base64UrlDecode(tokenStr);

    expect(decoded.length).toBe(expectedDecodedLength);
  });

  it("rejects a key that does not decode to exactly 32 bytes", async () => {
    await expect(encodeFernetToken("dG9vc2hvcnQ=", { a: 1 })).rejects.toThrow();
  });

  it("produces a different IV (and therefore different ciphertext) on each call", async () => {
    const a = new TextDecoder().decode(await encodeFernetToken(TEST_KEY, { a: 1 }));
    const b = new TextDecoder().decode(await encodeFernetToken(TEST_KEY, { a: 1 }));
    expect(a).not.toBe(b);
  });
});
