import { api } from './client';
import type { AuthUser, LoginOtpResponse, TokenResponse } from './types';

export const authApi = {
  login: (phone: string) => api<LoginOtpResponse>('/auth/login', { method: 'POST', body: { phone }, auth: false }),
  verifyOtp: (phone: string, code: string) =>
    api<TokenResponse>('/auth/verify-otp', { method: 'POST', body: { phone, code }, auth: false }),
  logout: (refreshToken: string) => api<void>('/auth/logout', { method: 'POST', body: { refreshToken }, auth: false }),
  me: () => api<AuthUser>('/auth/me'),
};
