import { API_BASE_URL } from './config';
import { tokenStore } from './tokenStore';
import type { ApiErrorBody, TokenResponse } from './types';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong. Please try again.';
}

export function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, QueryValue>;
  /** Attach the bearer token and refresh on 401 (default true). */
  auth?: boolean;
  signal?: AbortSignal;
}

// ---- session-expiry notification (AuthProvider subscribes) ----
type ExpiredListener = (message: string) => void;
const expiredListeners = new Set<ExpiredListener>();

export function onSessionExpired(fn: ExpiredListener) {
  expiredListeners.add(fn);
  return () => {
    expiredListeners.delete(fn);
  };
}

function endSession(message: string) {
  tokenStore.clear();
  expiredListeners.forEach((fn) => fn(message));
}

function buildUrl(path: string, query?: Record<string, QueryValue>) {
  const url = new URL(`${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function parseError(res: Response): Promise<ApiError> {
  let body: Partial<ApiErrorBody> | undefined;
  try {
    body = (await res.json()) as Partial<ApiErrorBody>;
  } catch {
    /* non-JSON error body */
  }
  const e = body?.error;
  return new ApiError(res.status, e?.code ?? `HTTP_${res.status}`, e?.message ?? `Request failed (${res.status})`, e?.details);
}

async function rawFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    if (isAbort(err)) throw err;
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and that the API is running.');
  }
}

// ---- refresh handling: at most one refresh request in flight ----
let refreshPromise: Promise<string> | null = null;

const EXPIRY_SKEW_MS = 20_000;
const isFresh = (expiresAt: string) => Date.parse(expiresAt) - Date.now() > EXPIRY_SKEW_MS;

/** Runs `fn` while holding a cross-tab lock when the Web Locks API is available. */
function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  return locks ? locks.request('smartTuition.admin.refresh', fn) : fn();
}

/**
 * Exchanges the stored refresh token for a new pair. Concurrent callers in this tab share one
 * request, and tabs serialise through a Web Lock. This matters because the backend rotates refresh
 * tokens and treats reuse of an already-revoked one as theft, revoking every session of the user.
 *
 * @param staleAccessToken the token that just failed; if another tab has already replaced it, the
 *   newer token is returned without another refresh.
 */
export function refreshAccessToken(staleAccessToken?: string): Promise<string> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = withRefreshLock(async () => {
    const session = tokenStore.reload();
    if (!session) throw new ApiError(401, 'UNAUTHORIZED', 'Please log in.');
    if (staleAccessToken && session.accessToken !== staleAccessToken && isFresh(session.accessTokenExpiresAt)) {
      return session.accessToken;
    }
    const res = await rawFetch(buildUrl('/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    if (!res.ok) {
      const err = await parseError(res);
      // Only a definitive rejection ends the session; a transient failure should not log the admin out.
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        endSession(err.message || 'Session expired. Please log in again.');
      }
      throw err;
    }
    const tokens = (await res.json()) as TokenResponse;
    if (tokens.user.role !== 'ADMIN') {
      const msg = 'This account does not have administrator access.';
      endSession(msg);
      throw new ApiError(403, 'FORBIDDEN', msg);
    }
    tokenStore.set(tokens);
    return tokens.accessToken;
  }).finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function currentAccessToken(): Promise<string | null> {
  const session = tokenStore.get();
  if (!session) return null;
  // Refresh proactively when the token is about to expire, saving a guaranteed 401 round-trip.
  if (!isFresh(session.accessTokenExpiresAt)) {
    try {
      return await refreshAccessToken(session.accessToken);
    } catch {
      return tokenStore.get()?.accessToken ?? null;
    }
  }
  return session.accessToken;
}

async function send(path: string, opts: RequestOptions): Promise<Response> {
  const { method = 'GET', body, query, auth = true, signal } = opts;
  const url = buildUrl(path, query);
  const makeInit = (token: string | null): RequestInit => {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    return { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal };
  };

  const token = auth ? await currentAccessToken() : null;
  let res = await rawFetch(url, makeInit(token));

  if (res.status === 401 && auth && tokenStore.get()) {
    const fresh = await refreshAccessToken(token ?? undefined);
    res = await rawFetch(url, makeInit(fresh));
    if (res.status === 401) {
      const err = await parseError(res);
      endSession(err.message);
      throw err;
    }
  }
  if (!res.ok) {
    const err = await parseError(res);
    // The account was blocked mid-session: the backend re-checks status on every request.
    if (res.status === 403 && auth && /blocked/i.test(err.message)) endSession(err.message);
    throw err;
  }
  return res;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await send(path, opts);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Fetches an authenticated binary resource (e.g. a private document) as a Blob. */
export async function apiBlob(path: string, opts: Omit<RequestOptions, 'body'> = {}): Promise<Blob> {
  const res = await send(path, opts);
  return res.blob();
}
