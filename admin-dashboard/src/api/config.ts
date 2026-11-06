const DEFAULT_BASE_URL = 'http://localhost:4100/api/v1';

/** API base including the /api/v1 prefix, without a trailing slash. */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');

/** Scheme + host + port of the API, used to resolve relative file paths such as /api/v1/files/photos/... */
export const API_ORIGIN = new URL(API_BASE_URL, window.location.href).origin;

/** Turns a relative backend path (e.g. a photoUrl) into an absolute URL. */
export function resolveFileUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`;
}
