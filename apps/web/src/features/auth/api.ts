import { encodeFernetToken } from "../../lib/fernet";

export interface LoginSuccess {
  ok: true;
  accessToken: string;
  refreshToken: string;
}

export interface LoginFailure {
  ok: false;
  status: number;
  body: unknown;
}

export type LoginResult = LoginSuccess | LoginFailure;

interface LoginResponseBody {
  access_token: string;
  refresh_token: string;
}

/**
 * Calls POST /api/auth/login. Resolves with a LoginSuccess/LoginFailure for any
 * handled HTTP response (2xx or otherwise); rejects only on a genuine network
 * failure (fetch itself throwing), per contracts/auth-integration.md.
 */
export async function login(email: string, password: string): Promise<LoginResult> {
  const encryptionKey = import.meta.env.VITE_PAYLOAD_ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error("VITE_PAYLOAD_ENCRYPTION_KEY is not configured.");
  }

  const body = await encodeFernetToken(encryptionKey, { email, password });

  const response = await fetch("/api/auth/login", {
    method: "POST",
    body,
  });

  if (response.ok) {
    const data = (await response.json()) as LoginResponseBody;
    return { ok: true, accessToken: data.access_token, refreshToken: data.refresh_token };
  }

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    responseBody = undefined;
  }
  return { ok: false, status: response.status, body: responseBody };
}
