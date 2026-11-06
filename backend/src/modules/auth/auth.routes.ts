import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../../config/env';
import { authenticate, currentUser } from '../../middleware/auth';
import { body } from '../../middleware/validate';
import { ah } from '../../utils/asyncHandler';
import { email, indianPhone, personName } from '../../utils/validators';
import * as auth from './auth.service';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Please try again later.' } },
});

const registerSchema = z.object({
  role: z.enum(['PARENT', 'TUTOR']),
  fullName: personName,
  phone: indianPhone,
  email,
});

router.post(
  '/register',
  authLimiter,
  ah(async (req, res) => {
    res.status(201).json(await auth.register(body(req, registerSchema)));
  }),
);

router.post(
  '/login',
  authLimiter,
  ah(async (req, res) => {
    const { phone } = body(req, z.object({ phone: indianPhone }));
    res.json(await auth.requestLoginOtp(phone));
  }),
);

router.post(
  '/verify-otp',
  authLimiter,
  ah(async (req, res) => {
    const { phone, code } = body(req, z.object({ phone: indianPhone, code: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits') }));
    res.json(await auth.verifyOtp(phone, code));
  }),
);

const refreshSchema = z.object({ refreshToken: z.string().min(20).max(200) });

router.post(
  '/refresh',
  ah(async (req, res) => {
    res.json(await auth.refresh(body(req, refreshSchema).refreshToken));
  }),
);

router.post(
  '/logout',
  ah(async (req, res) => {
    await auth.logout(body(req, refreshSchema).refreshToken);
    res.status(204).end();
  }),
);

router.get(
  '/me',
  authenticate,
  ah(async (req, res) => {
    res.json(await auth.getMe(currentUser(req).id));
  }),
);

router.put(
  '/fcm-token',
  authenticate,
  ah(async (req, res) => {
    const { token } = body(req, z.object({ token: z.string().min(10).max(4096).nullable() }));
    await auth.updateFcmToken(currentUser(req).id, token);
    res.status(204).end();
  }),
);

export default router;
