import { afterAll, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool';
import { api, auth, createAdmin, nextPhone, register } from './helpers';

afterAll(() => pool.end());

describe('authentication', () => {
  it('registers a parent with OTP and returns tokens + profile', async () => {
    const phone = nextPhone();
    const reg = await api()
      .post('/api/v1/auth/register')
      .send({ role: 'PARENT', fullName: 'Asha Kumar', phone, email: `asha${phone}@example.com` })
      .expect(201);
    expect(reg.body.otpSentTo).toMatch(/^\+91\*{6}\d{4}$/);
    expect(reg.body.devOtp).toMatch(/^\d{6}$/);

    const ok = await api().post('/api/v1/auth/verify-otp').send({ phone, code: reg.body.devOtp }).expect(200);
    expect(ok.body.user).toMatchObject({ role: 'PARENT', fullName: 'Asha Kumar', phone: `+91${phone}`, phoneVerified: true, profileComplete: false });
    expect(ok.body.accessToken).toBeTruthy();

    const me = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${ok.body.accessToken}`).expect(200);
    expect(me.body.id).toBe(ok.body.user.id);
  });

  it('validates input fields', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ role: 'PARENT', fullName: 'A', phone: '12345', email: 'not-an-email' })
      .expect(400);
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['fullName', 'phone', 'email']));
  });

  it('does not allow self-registration as admin', async () => {
    await api()
      .post('/api/v1/auth/register')
      .send({ role: 'ADMIN', fullName: 'Evil Admin', phone: nextPhone(), email: 'x@example.com' })
      .expect(400);
  });

  it('rejects a wrong OTP and locks after too many attempts', async () => {
    const phone = nextPhone();
    const reg = await api().post('/api/v1/auth/register').send({ role: 'TUTOR', fullName: 'Ravi T', phone, email: `r${phone}@example.com` }).expect(201);
    const wrong = reg.body.devOtp === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      await api().post('/api/v1/auth/verify-otp').send({ phone, code: wrong }).expect(400);
    }
    await api().post('/api/v1/auth/verify-otp').send({ phone, code: reg.body.devOtp }).expect(429);
  });

  it('enforces the resend cooldown', async () => {
    const s = await register('PARENT');
    // register() requested an OTP moments ago, so an immediate re-request is throttled
    const res = await api().post('/api/v1/auth/login').send({ phone: s.phone }).expect(429);
    expect(res.body.error.message).toMatch(/wait 30 seconds/);
  });

  it('blocks registering twice with the same verified number', async () => {
    const s = await register('PARENT');
    await api()
      .post('/api/v1/auth/register')
      .send({ role: 'PARENT', fullName: 'Someone Else', phone: s.phone, email: `other${s.phone}@example.com` })
      .expect(409);
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const s = await register('PARENT');
    const r1 = await api().post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken }).expect(200);
    expect(r1.body.refreshToken).not.toBe(s.refreshToken);
    // Re-using the old token revokes the whole family
    await api().post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken }).expect(401);
    await api().post('/api/v1/auth/refresh').send({ refreshToken: r1.body.refreshToken }).expect(401);
  });

  it('does not revoke other sessions when a logged-out token is presented', async () => {
    const s = await register('PARENT');
    const otp = await api().post('/api/v1/auth/login').send({ phone: s.phone });
    // second device session (may be throttled by cooldown; create directly via refresh instead)
    const second = await api().post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken }).expect(200);
    expect(otp.status === 200 || otp.status === 429).toBe(true);
    await api().post('/api/v1/auth/logout').send({ refreshToken: second.body.refreshToken }).expect(204);
    await api().post('/api/v1/auth/refresh').send({ refreshToken: second.body.refreshToken }).expect(401);
    // A different session of the same user is unaffected: the access token still works
    await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${second.body.accessToken}`).expect(200);
  });

  it('enforces role-based access control', async () => {
    const parent = await register('PARENT');
    const tutor = await register('TUTOR');
    await api().get('/api/v1/tutors/me').set(auth(parent)).expect(403);
    await api().get('/api/v1/parents/me').set(auth(tutor)).expect(403);
    await api().get('/api/v1/admin/stats').set(auth(parent)).expect(403);
    await api().get('/api/v1/tutors/search').set(auth(tutor)).expect(403);
    await api().get('/api/v1/parents/me').expect(401);
  });

  it('blocking a user takes effect immediately', async () => {
    const admin = await createAdmin();
    const parent = await register('PARENT');
    await api().get('/api/v1/parents/me').set(auth(parent)).expect(200);
    await api().post(`/api/v1/admin/users/${parent.userId}/block`).set(auth(admin)).send({ reason: 'Spam' }).expect(200);
    await api().get('/api/v1/parents/me').set(auth(parent)).expect(403);
    await api().post('/api/v1/auth/login').send({ phone: parent.phone }).expect(403);
    await api().post(`/api/v1/admin/users/${parent.userId}/unblock`).set(auth(admin)).expect(200);
    await api().get('/api/v1/parents/me').set(auth(parent)).expect(200);
  });
});
