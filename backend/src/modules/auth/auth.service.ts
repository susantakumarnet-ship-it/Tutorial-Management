import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env';
import { pool, query, withTx } from '../../db/pool';
import type { Role } from '../../middleware/auth';
import { sms } from '../../services/sms';
import { AppError, badRequest, conflict, forbidden, notFound, tooMany, unauthorized } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { maskPhone } from '../../utils/validators';

const OTP_RESEND_COOLDOWN_SECONDS = 30;
const MAX_OTP_PER_HOUR = 5;
const MAX_OTP_ATTEMPTS = 5;

interface UserRow {
  id: string;
  role: Role;
  full_name: string;
  phone: string;
  email: string | null;
  phone_verified: boolean;
  status: 'ACTIVE' | 'BLOCKED' | 'DELETED';
  created_at: Date;
}

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const hashOtp = (phone: string, code: string) =>
  crypto.createHmac('sha256', env.OTP_PEPPER).update(`${phone}:${code}`).digest('hex');

async function findUserByPhone(phone: string) {
  const { rows } = await query<UserRow>('SELECT * FROM users WHERE phone = $1', [phone]);
  return rows[0];
}

/** Generates, stores (hashed) and sends a 6-digit OTP, enforcing resend cooldown and hourly limits. */
async function issueOtp(phone: string) {
  const { rows } = await query<{ total: number; last: Date | null }>(
    `SELECT count(*)::int AS total, max(created_at) AS last
       FROM otp_codes WHERE phone = $1 AND created_at > now() - interval '1 hour'`,
    [phone],
  );
  const { total, last } = rows[0];
  if (total >= MAX_OTP_PER_HOUR) throw tooMany('Too many OTP requests. Please try again in an hour.');
  if (last && Date.now() - new Date(last).getTime() < OTP_RESEND_COOLDOWN_SECONDS * 1000) {
    throw tooMany(`Please wait ${OTP_RESEND_COOLDOWN_SECONDS} seconds before requesting a new OTP.`);
  }

  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  await withTx(async (tx) => {
    await tx.query('UPDATE otp_codes SET consumed_at = now() WHERE phone = $1 AND consumed_at IS NULL', [phone]);
    await tx.query(
      `INSERT INTO otp_codes (phone, code_hash, expires_at) VALUES ($1, $2, now() + make_interval(secs => $3))`,
      [phone, hashOtp(phone, code), env.OTP_TTL_SECONDS],
    );
  });
  await sms.send(phone, `${code} is your Smart Tuition verification code. It expires in ${Math.round(env.OTP_TTL_SECONDS / 60)} minutes.`);
  if (env.OTP_DEV_MODE) logger.warn({ phone, code }, 'OTP_DEV_MODE is on - OTP returned in API response');

  return {
    otpSentTo: maskPhone(phone),
    expiresInSeconds: env.OTP_TTL_SECONDS,
    ...(env.OTP_DEV_MODE ? { devOtp: code } : {}),
  };
}

export async function register(input: { role: 'PARENT' | 'TUTOR'; fullName: string; phone: string; email: string }) {
  const existing = await findUserByPhone(input.phone);
  if (existing?.phone_verified) {
    throw conflict('An account with this mobile number already exists. Please log in instead.');
  }
  const emailOwner = await query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [input.email]);
  if (emailOwner.rows[0] && emailOwner.rows[0].id !== existing?.id) {
    throw conflict('This email address is already registered with another account.');
  }

  await withTx(async (tx) => {
    let userId: string;
    if (existing) {
      // Unverified sign-up being retried: let the person correct their details.
      userId = existing.id;
      await tx.query('UPDATE users SET role = $2, full_name = $3, email = $4 WHERE id = $1', [
        userId,
        input.role,
        input.fullName,
        input.email,
      ]);
      await tx.query('DELETE FROM parent_profiles WHERE user_id = $1', [userId]);
      await tx.query('DELETE FROM tutor_profiles WHERE user_id = $1', [userId]);
    } else {
      const { rows } = await tx.query<{ id: string }>(
        'INSERT INTO users (role, full_name, phone, email) VALUES ($1, $2, $3, $4) RETURNING id',
        [input.role, input.fullName, input.phone, input.email],
      );
      userId = rows[0].id;
    }
    if (input.role === 'PARENT') {
      await tx.query('INSERT INTO parent_profiles (user_id) VALUES ($1)', [userId]);
    } else {
      await tx.query('INSERT INTO tutor_profiles (user_id) VALUES ($1)', [userId]);
    }
  });

  return issueOtp(input.phone);
}

export async function requestLoginOtp(phone: string) {
  const user = await findUserByPhone(phone);
  // Unverified sign-ups may also request a code (used by "Resend OTP"); verifying proves phone ownership.
  if (!user) throw new AppError(404, 'NOT_REGISTERED', 'No account found for this number. Please sign up as a parent or tutor first.');
  if (user.status !== 'ACTIVE') throw forbidden('This account has been blocked. Please contact support.');
  return issueOtp(phone);
}

export async function verifyOtp(phone: string, code: string) {
  const user = await findUserByPhone(phone);
  if (!user) throw badRequest('Incorrect or expired OTP');

  const { rows } = await query<{ id: string; code_hash: string; attempts: number }>(
    `SELECT id, code_hash, attempts FROM otp_codes
      WHERE phone = $1 AND consumed_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC LIMIT 1`,
    [phone],
  );
  const otp = rows[0];
  if (!otp) throw badRequest('OTP has expired. Please request a new one.');
  if (otp.attempts >= MAX_OTP_ATTEMPTS) throw tooMany('Too many incorrect attempts. Please request a new OTP.');

  const expected = Buffer.from(otp.code_hash, 'hex');
  const actual = Buffer.from(hashOtp(phone, code), 'hex');
  if (!crypto.timingSafeEqual(expected, actual)) {
    await query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [otp.id]);
    throw badRequest('Incorrect OTP');
  }

  await query('UPDATE otp_codes SET consumed_at = now() WHERE id = $1', [otp.id]);
  if (user.status !== 'ACTIVE') throw forbidden('This account has been blocked. Please contact support.');
  await query('UPDATE users SET phone_verified = true, last_login_at = now() WHERE id = $1', [user.id]);

  return issueTokens(user.id, user.role);
}

async function issueTokens(userId: string, role: Role) {
  const accessToken = jwt.sign({ sub: userId, role }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.ACCESS_TOKEN_TTL as SignOptions['expiresIn'],
  });
  const refreshToken = crypto.randomBytes(48).toString('base64url');
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + make_interval(days => $3))`,
    [userId, sha256(refreshToken), env.REFRESH_TOKEN_TTL_DAYS],
  );
  const decoded = jwt.decode(accessToken) as { exp: number };
  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt: new Date(decoded.exp * 1000).toISOString(),
    user: await getMe(userId),
  };
}

/** Rotates a refresh token. Presenting an already-revoked token revokes every session of that user. */
export async function refresh(refreshToken: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ id: string; user_id: string; revoked_at: Date | null; revoked_reason: string | null; expired: boolean }>(
      `SELECT id, user_id, revoked_at, revoked_reason, expires_at < now() AS expired
         FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
      [sha256(refreshToken)],
    );
    const token = rows[0];
    if (!token) throw unauthorized('Invalid refresh token');
    // Only a token that was already rotated indicates theft (someone else used it first). Tokens revoked by
    // logout or blocking are simply invalid.
    if (token.revoked_at && token.revoked_reason !== 'ROTATED') throw unauthorized('Session expired. Please log in again.');
    if (token.revoked_at) {
      await client.query(`UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = 'REUSE' WHERE user_id = $1 AND revoked_at IS NULL`, [
        token.user_id,
      ]);
      await client.query('COMMIT');
      logger.warn({ userId: token.user_id }, 'Refresh token reuse detected - all sessions revoked');
      throw unauthorized('Session expired. Please log in again.');
    }
    if (token.expired) throw unauthorized('Session expired. Please log in again.');
    await client.query(`UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = 'ROTATED' WHERE id = $1`, [token.id]);
    const user = await client.query<{ role: Role; status: string }>('SELECT role, status FROM users WHERE id = $1', [
      token.user_id,
    ]);
    if (user.rows[0]?.status !== 'ACTIVE') throw forbidden('This account has been blocked. Please contact support.');
    await client.query('COMMIT');
    return issueTokens(token.user_id, user.rows[0].role);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function logout(refreshToken: string) {
  await query(`UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = 'LOGOUT' WHERE token_hash = $1 AND revoked_at IS NULL`, [
    sha256(refreshToken),
  ]);
}

export async function getMe(userId: string) {
  const { rows } = await query<
    UserRow & { verification_status: string | null; photo_url: string | null; profile_complete: boolean }
  >(
    `SELECT u.*, tp.verification_status, tp.photo_url,
            CASE u.role
              WHEN 'PARENT' THEN EXISTS (SELECT 1 FROM students s WHERE s.parent_id = u.id AND s.is_active)
              WHEN 'TUTOR'  THEN tp.verification_status <> 'DRAFT'
              ELSE true END AS profile_complete
       FROM users u LEFT JOIN tutor_profiles tp ON tp.user_id = u.id
      WHERE u.id = $1`,
    [userId],
  );
  const u = rows[0];
  if (!u) throw notFound('User');
  return {
    id: u.id,
    role: u.role,
    fullName: u.full_name,
    phone: u.phone,
    email: u.email,
    phoneVerified: u.phone_verified,
    status: u.status,
    photoUrl: u.photo_url,
    tutorVerificationStatus: u.verification_status,
    profileComplete: u.profile_complete,
    createdAt: u.created_at,
  };
}

export async function updateFcmToken(userId: string, token: string | null) {
  await query('UPDATE users SET fcm_token = $2 WHERE id = $1', [userId, token]);
}
