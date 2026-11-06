import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/db/pool';

export const app = createApp();
export const api = () => request(app);

let phoneCounter = 0;
/** Unique valid Indian mobile numbers per test run. */
export function nextPhone() {
  phoneCounter += 1;
  return `98${String(Date.now() % 1_000_000).padStart(6, '0')}${String(phoneCounter).padStart(2, '0')}`;
}

export interface Session {
  token: string;
  refreshToken: string;
  userId: string;
  phone: string;
}

export async function register(role: 'PARENT' | 'TUTOR', name = 'Test User'): Promise<Session> {
  const phone = nextPhone();
  const reg = await api()
    .post('/api/v1/auth/register')
    .send({ role, fullName: name, phone, email: `${phone}@example.com` })
    .expect(201);
  const verify = await api().post('/api/v1/auth/verify-otp').send({ phone, code: reg.body.devOtp }).expect(200);
  return { token: verify.body.accessToken, refreshToken: verify.body.refreshToken, userId: verify.body.user.id, phone };
}

export async function createAdmin(): Promise<Session> {
  const phone = nextPhone();
  await pool.query(
    `INSERT INTO users (role, full_name, phone, phone_verified) VALUES ('ADMIN', 'Test Admin', $1, true)`,
    [`+91${phone}`],
  );
  const otp = await api().post('/api/v1/auth/login').send({ phone }).expect(200);
  const verify = await api().post('/api/v1/auth/verify-otp').send({ phone, code: otp.body.devOtp }).expect(200);
  return { token: verify.body.accessToken, refreshToken: verify.body.refreshToken, userId: verify.body.user.id, phone };
}

export const auth = (s: Session) => ({ Authorization: `Bearer ${s.token}` });

export async function meta() {
  const res = await api().get('/api/v1/meta').expect(200);
  const byName = (list: { id: number; name: string; code?: string }[], key: string) =>
    list.find((x) => x.name === key || x.code === key)!.id;
  return {
    classId: (n: string) => byName(res.body.classes, n),
    boardId: (c: string) => byName(res.body.boards, c),
    subjectId: (n: string) => byName(res.body.subjects, n),
  };
}

// 1x1 PNG and a minimal PDF for upload tests
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
export const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

/**
 * Builds a complete, approved tutor in Indiranagar (Bengaluru) teaching Class 8 Maths/Science (CBSE).
 */
export async function approvedTutor(admin: Session, overrides: Record<string, unknown> = {}, name = 'Tutor Person') {
  const m = await meta();
  const tutor = await register('TUTOR', name);
  await api()
    .put('/api/v1/tutors/me')
    .set(auth(tutor))
    .send({
      gender: 'FEMALE',
      headline: 'Maths specialist',
      experienceYears: 6,
      monthlyFee: 4000,
      teachingMode: 'BOTH',
      city: 'Bengaluru',
      pincode: '560038',
      locality: 'Indiranagar',
      latitude: 12.9784,
      longitude: 77.6408,
      serviceRadiusKm: 8,
      subjectIds: [m.subjectId('Mathematics'), m.subjectId('Science')],
      classIds: [m.classId('Class 8'), m.classId('Class 9')],
      boardIds: [m.boardId('CBSE')],
      ...overrides,
    })
    .expect(200);
  await api().put('/api/v1/tutors/me/qualifications').set(auth(tutor)).send({ qualifications: [{ degree: 'M.Sc. Maths', year: 2015 }] }).expect(200);
  await api()
    .put('/api/v1/tutors/me/availability')
    .set(auth(tutor))
    .send({ slots: [{ dayOfWeek: 1, startTime: '16:00', endTime: '19:00' }] })
    .expect(200);
  await api().post('/api/v1/tutors/me/photo').set(auth(tutor)).attach('photo', PNG, 'me.png').expect(200);
  await api().post('/api/v1/tutors/me/documents').set(auth(tutor)).field('docType', 'QUALIFICATION').attach('file', PDF, 'degree.pdf').expect(201);
  await api().post('/api/v1/tutors/me/submit-for-verification').set(auth(tutor)).expect(200);
  await api().post(`/api/v1/admin/tutors/${tutor.userId}/approve`).set(auth(admin)).send({}).expect(200);
  return tutor;
}
