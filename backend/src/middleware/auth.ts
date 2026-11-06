import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { query } from '../db/pool';
import { forbidden, unauthorized } from '../utils/errors';

export type Role = 'PARENT' | 'TUTOR' | 'ADMIN';

export interface AuthUser {
  id: string;
  role: Role;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

interface AccessClaims {
  sub: string;
  role: Role;
}

/**
 * Verifies the Bearer access token, then re-checks the account status in the database so that
 * blocking a user takes effect immediately instead of waiting for token expiry.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized();
    let claims: AccessClaims;
    try {
      claims = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] }) as AccessClaims;
    } catch {
      throw unauthorized('Invalid or expired access token');
    }
    const { rows } = await query<{ role: Role; status: string }>('SELECT role, status FROM users WHERE id = $1', [
      claims.sub,
    ]);
    const user = rows[0];
    if (!user) throw unauthorized('Account no longer exists');
    if (user.status !== 'ACTIVE') throw forbidden('This account has been blocked. Please contact support.');
    req.user = { id: claims.sub, role: user.role };
    next();
  } catch (err) {
    next(err);
  }
}

/** Role-based access control guard. Must run after `authenticate`. */
export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };

/** Convenience accessor for handlers that sit behind `authenticate`. */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
