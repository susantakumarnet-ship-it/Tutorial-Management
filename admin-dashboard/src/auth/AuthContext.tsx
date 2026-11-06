import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi } from '../api/auth';
import { ApiError, onSessionExpired } from '../api/client';
import { tokenStore } from '../api/tokenStore';
import type { AuthUser, LoginOtpResponse } from '../api/types';

export const NOT_ADMIN_MESSAGE =
  'This dashboard is for Smart Tuition administrators only. You have been signed out.';

interface AuthValue {
  user: AuthUser | null;
  /** True while the stored session is being validated on first load. */
  initialising: boolean;
  /** Message explaining why the admin was signed out (shown on the login page). */
  signOutReason: string | null;
  requestOtp: (phone: string) => Promise<LoginOtpResponse>;
  verifyOtp: (phone: string, code: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  clearSignOutReason: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => tokenStore.get()?.user ?? null);
  const [initialising, setInitialising] = useState(() => Boolean(tokenStore.get()));
  const [signOutReason, setSignOutReason] = useState<string | null>(null);

  // The API client signals when refresh fails or the account gets blocked.
  useEffect(
    () =>
      onSessionExpired((message) => {
        setUser(null);
        setSignOutReason(message);
      }),
    [],
  );

  // Validate any stored session once on load (refreshes the access token transparently if needed).
  useEffect(() => {
    if (!tokenStore.get()) return;
    let cancelled = false;
    authApi
      .me()
      .then((me) => {
        if (cancelled) return;
        if (me.role !== 'ADMIN') {
          tokenStore.clear();
          setUser(null);
          setSignOutReason(NOT_ADMIN_MESSAGE);
          return;
        }
        tokenStore.setUser(me);
        setUser(me);
      })
      .catch((err) => {
        if (cancelled) return;
        // Network errors keep the cached session so the app still opens; auth errors were handled by the client.
        if (err instanceof ApiError && err.status !== 0 && !tokenStore.get()) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setInitialising(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const requestOtp = useCallback((phone: string) => authApi.login(phone), []);

  const verifyOtp = useCallback(async (phone: string, code: string) => {
    const tokens = await authApi.verifyOtp(phone, code);
    if (tokens.user.role !== 'ADMIN') {
      // Revoke the session we were just given; a non-admin must not stay signed in here.
      await authApi.logout(tokens.refreshToken).catch(() => undefined);
      tokenStore.clear();
      throw new ApiError(403, 'NOT_ADMIN', NOT_ADMIN_MESSAGE);
    }
    tokenStore.set(tokens);
    setSignOutReason(null);
    setUser(tokens.user);
    return tokens.user;
  }, []);

  const logout = useCallback(async () => {
    const session = tokenStore.get();
    tokenStore.clear();
    setUser(null);
    if (session) await authApi.logout(session.refreshToken).catch(() => undefined);
  }, []);

  const clearSignOutReason = useCallback(() => setSignOutReason(null), []);

  const value = useMemo(
    () => ({ user, initialising, signOutReason, requestOtp, verifyOtp, logout, clearSignOutReason }),
    [user, initialising, signOutReason, requestOtp, verifyOtp, logout, clearSignOutReason],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
