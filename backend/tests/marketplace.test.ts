import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool';
import { api, approvedTutor, auth, createAdmin, meta, register, type Session } from './helpers';

afterAll(() => pool.end());

let admin: Session;
let m: Awaited<ReturnType<typeof meta>>;

beforeAll(async () => {
  admin = await createAdmin();
  m = await meta();
});

async function parentWithChild(name = 'Parent Person') {
  const parent = await register('PARENT', name);
  const child = await api()
    .post('/api/v1/parents/me/students')
    .set(auth(parent))
    .send({ name: 'Kid Kumar', classId: m.classId('Class 8'), boardId: m.boardId('CBSE'), gender: 'MALE' })
    .expect(201);
  return { parent, studentId: child.body.id as string };
}

async function postRequirement(parent: Session, studentId: string, overrides: Record<string, unknown> = {}) {
  const res = await api()
    .post('/api/v1/requirements')
    .set(auth(parent))
    .send({
      studentId,
      subjectIds: [m.subjectId('Mathematics')],
      daysPerWeek: 4,
      preferredTime: 'Evening 5-7 PM',
      monthlyBudget: 5000,
      mode: 'HOME',
      city: 'Bengaluru',
      pincode: '560038',
      locality: 'Indiranagar',
      latitude: 12.9801,
      longitude: 77.6421,
      additionalNotes: 'Algebra help',
      ...overrides,
    })
    .expect(201);
  return res.body;
}

describe('parent profile and children', () => {
  it('manages multiple children', async () => {
    const parent = await register('PARENT');
    for (const name of ['Child One', 'Child Two']) {
      await api().post('/api/v1/parents/me/students').set(auth(parent)).send({ name, classId: m.classId('Class 3') }).expect(201);
    }
    const profile = await api().get('/api/v1/parents/me').set(auth(parent)).expect(200);
    expect(profile.body.students).toHaveLength(2);
    expect(profile.body.students[0]).toMatchObject({ className: 'Class 3' });

    const me = await api().get('/api/v1/auth/me').set(auth(parent)).expect(200);
    expect(me.body.profileComplete).toBe(true);

    const other = await register('PARENT');
    await api().delete(`/api/v1/parents/me/students/${profile.body.students[0].id}`).set(auth(other)).expect(404);
    await api().delete(`/api/v1/parents/me/students/${profile.body.students[0].id}`).set(auth(parent)).expect(204);
  });

  it('updates parent profile fields', async () => {
    const parent = await register('PARENT');
    const res = await api()
      .put('/api/v1/parents/me')
      .set(auth(parent))
      .send({ addressLine: '12 MG Road', city: 'Bengaluru', pincode: '560001', latitude: 12.97, longitude: 77.6 })
      .expect(200);
    expect(res.body).toMatchObject({ addressLine: '12 MG Road', city: 'Bengaluru', pincode: '560001' });
  });
});

describe('tutor onboarding and verification', () => {
  it('reports missing fields and refuses incomplete submission', async () => {
    const tutor = await register('TUTOR');
    const me = await api().get('/api/v1/tutors/me').set(auth(tutor)).expect(200);
    expect(me.body.verificationStatus).toBe('DRAFT');
    expect(me.body.completeness.complete).toBe(false);
    const res = await api().post('/api/v1/tutors/me/submit-for-verification').set(auth(tutor)).expect(400);
    expect(res.body.error.details).toContain('Profile photograph');
  });

  it('rejects uploads whose content is not an allowed type', async () => {
    const tutor = await register('TUTOR');
    await api()
      .post('/api/v1/tutors/me/documents')
      .set(auth(tutor))
      .field('docType', 'QUALIFICATION')
      .attach('file', Buffer.from('MZ fake executable'), { filename: 'cert.pdf', contentType: 'application/pdf' })
      .expect(400);
  });

  it('is not searchable until an admin approves', async () => {
    const parent = await register('PARENT');
    const tutor = await register('TUTOR', 'Hidden Tutor');
    await api()
      .put('/api/v1/tutors/me')
      .set(auth(tutor))
      .send({ gender: 'MALE', monthlyFee: 3000, city: 'Bengaluru', pincode: '560038', latitude: 12.97, longitude: 77.64 })
      .expect(200);
    await api().get(`/api/v1/tutors/${tutor.userId}`).set(auth(parent)).expect(404);
    const search = await api().get('/api/v1/tutors/search').query({ q: 'Hidden Tutor' }).set(auth(parent)).expect(200);
    expect(search.body.items).toHaveLength(0);
  });

  it('completes the full verification workflow', async () => {
    const tutor = await approvedTutor(admin, {}, 'Verified Teacher');
    const me = await api().get('/api/v1/tutors/me').set(auth(tutor)).expect(200);
    expect(me.body.verificationStatus).toBe('APPROVED');
    expect(me.body.documents[0].status).toBe('APPROVED');
    const notes = await api().get('/api/v1/notifications').set(auth(tutor)).expect(200);
    expect(notes.body.items[0].type).toBe('TUTOR_APPROVED');
  });

  it('admin rejection requires a reason', async () => {
    const tutor = await approvedTutor(admin);
    await api().post(`/api/v1/admin/tutors/${tutor.userId}/reject`).set(auth(admin)).send({}).expect(400);
    await api().post(`/api/v1/admin/tutors/${tutor.userId}/reject`).set(auth(admin)).send({ note: 'Blurry certificate' }).expect(200);
  });
});

describe('tutor discovery for parents', () => {
  it('filters by class, subject, board, fee, gender, mode and distance', async () => {
    const parent = await register('PARENT');
    const near = await approvedTutor(admin, {}, 'Nearby Nisha');
    await approvedTutor(admin, { latitude: 19.1364, longitude: 72.8296, city: 'Mumbai', pincode: '400058' }, 'Faraway Farah');
    await approvedTutor(admin, { monthlyFee: 15000 }, 'Pricey Priya');

    const res = await api()
      .get('/api/v1/tutors/search')
      .set(auth(parent))
      .query({
        lat: 12.98, lng: 77.642, radiusKm: 5, classId: m.classId('Class 8'), subjectId: m.subjectId('Mathematics'),
        boardId: m.boardId('CBSE'), maxFee: 5000, gender: 'FEMALE', mode: 'OFFLINE', sort: 'distance',
      })
      .expect(200);
    const names = res.body.items.map((t: { fullName: string }) => t.fullName);
    expect(names).toContain('Nearby Nisha');
    expect(names).not.toContain('Faraway Farah');
    expect(names).not.toContain('Pricey Priya');
    const card = res.body.items.find((t: { id: string }) => t.id === near.userId);
    expect(card.distanceKm).toBeLessThan(2);
    expect(card).not.toHaveProperty('phone');

    // Wrong class -> nothing from this tutor
    const none = await api().get('/api/v1/tutors/search').set(auth(parent)).query({ classId: m.classId('Class 12'), q: 'Nearby Nisha' }).expect(200);
    expect(none.body.items).toHaveLength(0);

    // Online search ignores distance
    const online = await api().get('/api/v1/tutors/search').set(auth(parent)).query({ lat: 28.6, lng: 77.2, mode: 'ONLINE', q: 'Faraway Farah' }).expect(200);
    expect(online.body.items).toHaveLength(1);
  });

  it('filters by available day and time and by city', async () => {
    const parent = await register('PARENT');
    await approvedTutor(admin, {}, 'Monday Mohan');
    const hit = await api().get('/api/v1/tutors/search').set(auth(parent)).query({ q: 'Monday Mohan', dayOfWeek: 1, timeFrom: '17:00', timeTo: '18:00', city: 'bengaluru' }).expect(200);
    expect(hit.body.items).toHaveLength(1);
    const miss = await api().get('/api/v1/tutors/search').set(auth(parent)).query({ q: 'Monday Mohan', dayOfWeek: 2 }).expect(200);
    expect(miss.body.items).toHaveLength(0);
  });

  it('hides tutor contact details on the public profile', async () => {
    const parent = await register('PARENT');
    const tutor = await approvedTutor(admin);
    const res = await api().get(`/api/v1/tutors/${tutor.userId}`).set(auth(parent)).expect(200);
    expect(res.body.contact).toBeNull();
    expect(res.body.subjects.length).toBeGreaterThan(0);
    expect(res.body.verifiedDocuments).toBe(1);
    expect(res.body).not.toHaveProperty('phone');
    expect(res.body).not.toHaveProperty('latitude');
  });
});

describe('tuition requirements', () => {
  it('lets a parent post, list, edit and close a requirement', async () => {
    const { parent, studentId } = await parentWithChild();
    const r = await postRequirement(parent, studentId);
    expect(r).toMatchObject({ status: 'OPEN', className: 'Class 8', boardCode: 'CBSE', studentName: 'Kid Kumar', daysPerWeek: 4 });

    const mine = await api().get('/api/v1/requirements/mine').set(auth(parent)).expect(200);
    expect(mine.body).toHaveLength(1);

    const edited = await api()
      .put(`/api/v1/requirements/${r.id}`)
      .set(auth(parent))
      .send({ studentId, subjectIds: [m.subjectId('Mathematics'), m.subjectId('Science')], daysPerWeek: 5, preferredTime: 'Morning',
        monthlyBudget: 6000, mode: 'EITHER', city: 'Bengaluru', pincode: '560038', latitude: 12.98, longitude: 77.64 })
      .expect(200);
    expect(edited.body.subjects).toHaveLength(2);

    await api().post(`/api/v1/requirements/${r.id}/close`).set(auth(parent)).expect(200);
    await api().put(`/api/v1/requirements/${r.id}`).set(auth(parent)).send({ studentId, subjectIds: [1], daysPerWeek: 1, preferredTime: 'x1',
      monthlyBudget: 500, mode: 'ONLINE', city: 'Bengaluru', pincode: '560038' }).expect(404);
  });

  it('cannot post for somebody else’s child', async () => {
    const { studentId } = await parentWithChild();
    const stranger = await register('PARENT');
    await api().post('/api/v1/requirements').set(auth(stranger)).send({
      studentId, subjectIds: [m.subjectId('Mathematics')], daysPerWeek: 2, preferredTime: 'Evening', monthlyBudget: 3000,
      mode: 'ONLINE', city: 'Bengaluru', pincode: '560038',
    }).expect(400);
  });

  it('shows nearby requirements to tutors without revealing private details', async () => {
    const { parent, studentId } = await parentWithChild('Private Parent');
    const r = await postRequirement(parent, studentId);
    const tutor = await approvedTutor(admin);

    const list = await api().get('/api/v1/requirements/discover').set(auth(tutor)).query({ matchProfile: true }).expect(200);
    const found = list.body.items.find((x: { id: string }) => x.id === r.id);
    expect(found).toBeTruthy();
    expect(found).not.toHaveProperty('studentName');
    expect(found).not.toHaveProperty('latitude');
    expect(found.approxLatitude).toBe(12.98);
    expect(found.distanceKm).toBeGreaterThanOrEqual(0.5);
    expect(JSON.stringify(found)).not.toContain('Private Parent');
    expect(JSON.stringify(found)).not.toContain('Kid Kumar');

    // A tutor in Mumbai does not see it
    const far = await approvedTutor(admin, { latitude: 19.13, longitude: 72.82, city: 'Mumbai', pincode: '400058', teachingMode: 'OFFLINE' });
    const farList = await api().get('/api/v1/requirements/discover').set(auth(far)).expect(200);
    expect(farList.body.items.find((x: { id: string }) => x.id === r.id)).toBeUndefined();
  });

  it('respects the preferred tutor gender', async () => {
    const { parent, studentId } = await parentWithChild();
    const r = await postRequirement(parent, studentId, { preferredTutorGender: 'MALE' });
    const female = await approvedTutor(admin, { gender: 'FEMALE' });
    const list = await api().get('/api/v1/requirements/discover').set(auth(female)).expect(200);
    expect(list.body.items.find((x: { id: string }) => x.id === r.id)).toBeUndefined();
    await api().post('/api/v1/applications').set(auth(female)).send({ requirementId: r.id }).expect(403);
  });

  it('lets tutors save requirements', async () => {
    const { parent, studentId } = await parentWithChild();
    const r = await postRequirement(parent, studentId);
    const tutor = await approvedTutor(admin);
    await api().put(`/api/v1/requirements/${r.id}/save`).set(auth(tutor)).expect(200);
    const saved = await api().get('/api/v1/requirements/saved').set(auth(tutor)).expect(200);
    expect(saved.body.items.map((x: { id: string }) => x.id)).toEqual([r.id]);
    await api().delete(`/api/v1/requirements/${r.id}/save`).set(auth(tutor)).expect(200);
  });
});

describe('applications and requests', () => {
  it('runs apply -> notify -> accept -> contact reveal', async () => {
    const { parent, studentId } = await parentWithChild('Meena Iyer');
    const r = await postRequirement(parent, studentId);
    const tutor = await approvedTutor(admin, {}, 'Applying Anil');

    const app = await api().post('/api/v1/applications').set(auth(tutor)).send({ requirementId: r.id, message: 'I can help', proposedFee: 4500 }).expect(201);
    expect(app.body.parent.contact).toBeNull();
    expect(app.body.parent.fullName).toBe('Meena');
    expect(app.body.student.name).toBeNull();

    // Duplicate prevention
    await api().post('/api/v1/applications').set(auth(tutor)).send({ requirementId: r.id }).expect(409);

    const notes = await api().get('/api/v1/notifications').set(auth(parent)).expect(200);
    expect(notes.body.unread).toBeGreaterThan(0);
    expect(notes.body.items[0]).toMatchObject({ type: 'APPLICATION_RECEIVED' });

    // The tutor can't accept their own application
    await api().post(`/api/v1/applications/${app.body.id}/accept`).set(auth(tutor)).expect(404);

    const incoming = await api().get('/api/v1/applications').set(auth(parent)).query({ box: 'incoming' }).expect(200);
    expect(incoming.body.items[0].canRespond).toBe(true);

    const accepted = await api().post(`/api/v1/applications/${app.body.id}/accept`).set(auth(parent)).expect(200);
    expect(accepted.body.status).toBe('ACCEPTED');
    expect(accepted.body.tutor.contact.phone).toBe(`+91${tutor.phone}`);
    expect(accepted.body.bookingStatus).toBe('DEMO_PENDING');
    expect(accepted.body.conversationId).toBeTruthy();

    const tutorView = await api().get(`/api/v1/applications/${app.body.id}`).set(auth(tutor)).expect(200);
    expect(tutorView.body.parent.contact.phone).toBe(`+91${parent.phone}`);
    expect(tutorView.body.student.name).toBe('Kid Kumar');

    await api().post(`/api/v1/applications/${app.body.id}/reject`).set(auth(parent)).expect(409);

    const profile = await api().get(`/api/v1/tutors/${tutor.userId}`).set(auth(parent)).expect(200);
    expect(profile.body.contact.phone).toBe(`+91${tutor.phone}`);
  });

  it('only verified tutors may apply', async () => {
    const { parent, studentId } = await parentWithChild();
    const r = await postRequirement(parent, studentId);
    const unverified = await register('TUTOR');
    await api().post('/api/v1/applications').set(auth(unverified)).send({ requirementId: r.id }).expect(403);
  });

  it('lets a parent request a tutor directly, once at a time', async () => {
    const { parent, studentId } = await parentWithChild();
    const tutor = await approvedTutor(admin);
    const req = await api().post('/api/v1/applications/direct').set(auth(parent)).send({ tutorId: tutor.userId, studentId }).expect(201);
    expect(req.body.initiatedBy).toBe('PARENT');
    await api().post('/api/v1/applications/direct').set(auth(parent)).send({ tutorId: tutor.userId, studentId }).expect(409);

    const inbox = await api().get('/api/v1/applications').set(auth(tutor)).query({ box: 'incoming' }).expect(200);
    expect(inbox.body.items).toHaveLength(1);
    await api().post(`/api/v1/applications/${req.body.id}/reject`).set(auth(tutor)).expect(200);

    // After a decision, a new request is allowed again
    await api().post('/api/v1/applications/direct').set(auth(parent)).send({ tutorId: tutor.userId, studentId }).expect(201);
  });

  it('lets the initiator withdraw a pending application', async () => {
    const { parent, studentId } = await parentWithChild();
    const r = await postRequirement(parent, studentId);
    const tutor = await approvedTutor(admin);
    const app = await api().post('/api/v1/applications').set(auth(tutor)).send({ requirementId: r.id }).expect(201);
    await api().post(`/api/v1/applications/${app.body.id}/withdraw`).set(auth(parent)).expect(404);
    const w = await api().post(`/api/v1/applications/${app.body.id}/withdraw`).set(auth(tutor)).expect(200);
    expect(w.body.status).toBe('WITHDRAWN');
  });
});

describe('admin', () => {
  it('returns dashboard statistics and lists', async () => {
    const stats = await api().get('/api/v1/admin/stats').set(auth(admin)).expect(200);
    expect(stats.body.tutors).toBeGreaterThan(0);
    expect(stats.body.signups).toHaveLength(14);
    const pending = await api().get('/api/v1/admin/tutors').query({ status: 'APPROVED' }).set(auth(admin)).expect(200);
    expect(pending.body.total).toBeGreaterThan(0);
    const users = await api().get('/api/v1/admin/users').query({ role: 'PARENT' }).set(auth(admin)).expect(200);
    expect(users.body.items.every((u: { role: string }) => u.role === 'PARENT')).toBe(true);
    const reqs = await api().get('/api/v1/admin/requirements').set(auth(admin)).expect(200);
    expect(reqs.body.total).toBeGreaterThan(0);
  });
});
