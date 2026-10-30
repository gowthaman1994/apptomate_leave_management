const VERSION_BYTE = 0x80;

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlEncode(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_");
}

function encodeTimestamp(seconds: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(8);
  // Big-endian 64-bit unsigned integer; Math.floor(Date.now() / 1000) never
  // approaches a value needing the high 32 bits, but fill them explicitly
  // for correctness against the Fernet spec's fixed 8-byte field.
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0);
  view.setUint32(4, seconds);
  return bytes;
}

function concatBytes(...parts: Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/**
 * Encodes `payload` as a Fernet token matching Python's
 * `cryptography.fernet.Fernet`, byte for byte: version(1) + timestamp(8) +
 * IV(16) + AES-128-CBC-PKCS7 ciphertext + HMAC-SHA256(32), base64url-encoded.
 * `key` is the same base64url 32-byte key both sides share (research.md §5).
 * Returns the UTF-8 bytes of that base64url string — exactly what should go
 * on the wire as the request body.
 */
export async function encodeFernetToken(
  key: string,
  payload: unknown,
): Promise<Uint8Array<ArrayBuffer>> {
  const keyBytes = base64UrlDecode(key);
  if (keyBytes.length !== 32) {
    throw new Error("Fernet key must decode to exactly 32 bytes.");
  }
  const signingKeyBytes = keyBytes.slice(0, 16);
  const encryptionKeyBytes = keyBytes.slice(16, 32);

  const iv = new Uint8Array(16);
  crypto.getRandomValues(iv);

  const timestamp = encodeTimestamp(Math.floor(Date.now() / 1000));
  const version = new Uint8Array([VERSION_BYTE]);

  const plaintext = new TextEncoder().encode(JSON.stringify(payload));

  const aesKey = await crypto.subtle.importKey(
    "raw",
    encryptionKeyBytes,
    { name: "AES-CBC" },
    false,
    ["encrypt"],
  );
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv },
    aesKey,
    plaintext,
  );
  const ciphertext = new Uint8Array(ciphertextBuffer);

  const signingInput = concatBytes(version, timestamp, iv, ciphertext);

  const hmacKey = await crypto.subtle.importKey(
    "raw",
    signingKeyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const hmacBuffer = await crypto.subtle.sign("HMAC", hmacKey, signingInput);
  const hmac = new Uint8Array(hmacBuffer);

  const token = concatBytes(signingInput, hmac);
  const tokenString = base64UrlEncode(token);

  return new TextEncoder().encode(tokenString);
}
