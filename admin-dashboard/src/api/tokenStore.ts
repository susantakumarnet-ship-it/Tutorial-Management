import type { AuthUser, TokenResponse } from './types';

const KEY = 'smartTuition.admin.session';

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  user: AuthUser;
}

let cache: StoredSession | null | undefined;

function read(): StoredSession | null {
  if (cache !== undefined) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    cache = null;
  }
  return cache;
}

function write(session: StoredSession) {
  cache = session;
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    /* storage unavailable - session lives in memory only */
  }
}

export const tokenStore = {
  get: read,
  /** Bypasses the in-memory cache, picking up tokens another tab may have just rotated. */
  reload(): StoredSession | null {
    cache = undefined;
    return read();
  },
  set(tokens: TokenResponse) {
    write({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      user: tokens.user,
    });
  },
  setUser(user: AuthUser) {
    const s = read();
    if (s) write({ ...s, user });
  },
  clear() {
    cache = null;
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  },
};

// Another tab rotated or cleared the tokens: drop the in-memory copy so the next read picks it up.
window.addEventListener('storage', (e) => {
  if (e.key === KEY) cache = undefined;
});
