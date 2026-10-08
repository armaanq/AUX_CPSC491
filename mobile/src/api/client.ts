import { API_BASE_URL, USING_LOCAL_SERVER } from './config';

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

/** Set by the auth provider; every request after this carries the login token. */
export function setAuthToken(token: string | null) {
  authToken = token;
}

/** Called when the server rejects the current login token (expired, revoked). */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.body) headers['Content-Type'] = 'application/json';
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  } catch (err) {
    if (init?.signal?.aborted) throw err;
    throw new ApiError(
      USING_LOCAL_SERVER
        ? `Can't reach your local AUX server at ${API_BASE_URL}. Is \`npm run start:dev\` running in server/?`
        : "Can't reach the AUX server. Check your internet connection and try again.",
    );
  }
  if (!res.ok) {
    // Only a token we sent can be "expired"; a failed login is a 401 too.
    if (res.status === 401 && authToken) onUnauthorized?.();
    const body = (await res.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(body?.message)
      ? body?.message.join(', ')
      : body?.message;
    throw new ApiError(message || `Server error ${res.status}`, res.status);
  }
  return (await res.json()) as T;
}
