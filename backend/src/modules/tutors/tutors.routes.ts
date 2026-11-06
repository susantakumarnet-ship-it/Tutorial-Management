import fs from 'node:fs';
import { Router } from 'express';
import { z } from 'zod';
import { query, withTx } from '../../db/pool';
import { authenticate, currentUser, requireRole } from '../../middleware/auth';
import { body, params, queryParams } from '../../middleware/validate';
import { deleteFile, resolveKey, saveFile, sniff, upload } from '../../services/storage';
import { ah } from '../../utils/asyncHandler';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { pageQuery } from '../../utils/pagination';
import { email, idParam, latitude, longitude, optionalText, personName, pincode, time24 } from '../../utils/validators';
import * as tutors from './tutors.service';

const router = Router();
router.use(authenticate);

const tutorOnly = requireRole('TUTOR');
const ids = z.array(z.number().int().positive()).max(50);

// =====================================================================
// Tutor's own profile
// =====================================================================

router.get(
  '/me',
  tutorOnly,
  ah(async (req, res) => {
    const id = currentUser(req).id;
    res.json({ ...(await tutors.getOwnProfile(id)), completeness: await tutors.checkCompleteness(id) });
  }),
);

const profileSchema = z
  .object({
    fullName: personName,
    email,
    headline: optionalText(160),
    bio: optionalText(2000),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']).nullable(),
    experienceYears: z.number().int().min(0).max(60),
    experienceDetails: optionalText(2000),
    monthlyFee: z.number().int().min(100).max(200000).nullable(),
    teachingMode: z.enum(['ONLINE', 'OFFLINE', 'BOTH']),
    locationId: z.number().int().positive().nullable(),
    locality: optionalText(120),
    city: optionalText(80),
    pincode: pincode.nullable(),
    latitude: latitude.nullable(),
    longitude: longitude.nullable(),
    serviceRadiusKm: z.number().int().min(1).max(100),
    subjectIds: ids,
    classIds: ids,
    boardIds: ids,
  })
  .partial()
  .refine((v) => (v.latitude === undefined) === (v.longitude === undefined), {
    message: 'latitude and longitude must be provided together',
  });

const PROFILE_COLUMNS: Record<string, string> = {
  headline: 'headline',
  bio: 'bio',
  gender: 'gender',
  experienceYears: 'experience_years',
  experienceDetails: 'experience_details',
  monthlyFee: 'monthly_fee',
  teachingMode: 'teaching_mode',
  locationId: 'location_id',
  locality: 'locality',
  city: 'city',
  pincode: 'pincode',
  latitude: 'latitude',
  longitude: 'longitude',
  serviceRadiusKm: 'service_radius_km',
};

router.put(
  '/me',
  tutorOnly,
  ah(async (req, res) => {
    const userId = currentUser(req).id;
    const input = body(req, profileSchema) as Record<string, unknown> & z.infer<typeof profileSchema>;

    if (input.email) {
      const taken = await query('SELECT 1 FROM users WHERE lower(email) = $1 AND id <> $2', [input.email, userId]);
      if (taken.rowCount) throw conflict('This email address is already registered with another account.');
    }
    // Picking a known locality fills in any address fields the client left out.
    if (input.locationId) {
      const loc = await query('SELECT locality, city, pincode, latitude, longitude FROM locations WHERE id = $1', [input.locationId]);
      if (!loc.rows[0]) throw badRequest('Unknown location');
      for (const k of ['locality', 'city', 'pincode', 'latitude', 'longitude']) {
        if (input[k] === undefined) input[k] = loc.rows[0][k];
      }
    }

    await withTx(async (tx) => {
      if (input.fullName || input.email) {
        await tx.query('UPDATE users SET full_name = COALESCE($2, full_name), email = COALESCE($3, email) WHERE id = $1', [
          userId,
          input.fullName ?? null,
          input.email ?? null,
        ]);
      }
      const sets: string[] = [];
      const values: unknown[] = [userId];
      for (const [key, column] of Object.entries(PROFILE_COLUMNS)) {
        if (input[key] !== undefined) {
          values.push(input[key]);
          sets.push(`${column} = $${values.length}`);
        }
      }
      if (sets.length) await tx.query(`UPDATE tutor_profiles SET ${sets.join(', ')} WHERE user_id = $1`, values);

      const links: [keyof typeof input, string, string][] = [
        ['subjectIds', 'tutor_subjects', 'subject_id'],
        ['classIds', 'tutor_classes', 'class_id'],
        ['boardIds', 'tutor_boards', 'board_id'],
      ];
      for (const [key, table, column] of links) {
        const list = input[key] as number[] | undefined;
        if (!list) continue;
        await tx.query(`DELETE FROM ${table} WHERE tutor_id = $1`, [userId]);
        if (list.length) {
          await tx.query(
            `INSERT INTO ${table} (tutor_id, ${column}) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING`,
            [userId, [...new Set(list)]],
          );
        }
      }
    });
    res.json({ ...(await tutors.getOwnProfile(userId)), completeness: await tutors.checkCompleteness(userId) });
  }),
);

const qualificationsSchema = z.object({
  qualifications: z
    .array(
      z.object({
        degree: z.string().trim().min(2).max(120),
        institution: optionalText(160),
        year: z.number().int().min(1950).max(new Date().getFullYear() + 1).nullable().optional(),
      }),
    )
    .max(15),
});

router.put(
  '/me/qualifications',
  tutorOnly,
  ah(async (req, res) => {
    const userId = currentUser(req).id;
    const { qualifications } = body(req, qualificationsSchema);
    await withTx(async (tx) => {
      await tx.query('DELETE FROM tutor_qualifications WHERE tutor_id = $1', [userId]);
      for (const q of qualifications) {
        await tx.query('INSERT INTO tutor_qualifications (tutor_id, degree, institution, year) VALUES ($1, $2, $3, $4)', [
          userId,
          q.degree,
          q.institution,
          q.year ?? null,
        ]);
      }
    });
    res.json((await tutors.getOwnProfile(userId)).qualifications);
  }),
);

const availabilitySchema = z.object({
  slots: z
    .array(
      z
        .object({ dayOfWeek: z.number().int().min(0).max(6), startTime: time24, endTime: time24 })
        .refine((s) => s.startTime < s.endTime, { message: 'startTime must be before endTime' }),
    )
    .max(50),
});

router.put(
  '/me/availability',
  tutorOnly,
  ah(async (req, res) => {
    const userId = currentUser(req).id;
    const { slots } = body(req, availabilitySchema);
    await withTx(async (tx) => {
      await tx.query('DELETE FROM tutor_availability WHERE tutor_id = $1', [userId]);
      for (const s of slots) {
        await tx.query('INSERT INTO tutor_availability (tutor_id, day_of_week, start_time, end_time) VALUES ($1, $2, $3, $4)', [
          userId,
          s.dayOfWeek,
          s.startTime,
          s.endTime,
        ]);
      }
    });
    res.json((await tutors.getOwnProfile(userId)).availability);
  }),
);

router.patch(
  '/me/availability-status',
  tutorOnly,
  ah(async (req, res) => {
    const { isAvailable } = body(req, z.object({ isAvailable: z.boolean() }));
    await query('UPDATE tutor_profiles SET is_available = $2 WHERE user_id = $1', [currentUser(req).id, isAvailable]);
    res.json({ isAvailable });
  }),
);

router.post(
  '/me/photo',
  tutorOnly,
  upload.single('photo'),
  ah(async (req, res) => {
    const userId = currentUser(req).id;
    if (!req.file) throw badRequest('Attach an image in the "photo" field');
    const type = sniff(req.file.buffer, ['image/jpeg', 'image/png', 'image/webp']);
    const key = await saveFile('photos', userId, req.file.buffer, type.ext);
    const url = `/api/v1/files/${key}`;
    const old = await query<{ photo_url: string | null }>('SELECT photo_url FROM tutor_profiles WHERE user_id = $1', [userId]);
    await query('UPDATE tutor_profiles SET photo_url = $2 WHERE user_id = $1', [userId, url]);
    const oldUrl = old.rows[0]?.photo_url;
    if (oldUrl?.startsWith('/api/v1/files/')) await deleteFile(oldUrl.replace('/api/v1/files/', ''));
    res.json({ photoUrl: url });
  }),
);

// ---------------- Verification documents ----------------

const MAX_DOCUMENTS = 10;

router.get(
  '/me/documents',
  tutorOnly,
  ah(async (req, res) => {
    res.json((await tutors.getOwnProfile(currentUser(req).id)).documents);
  }),
);

router.post(
  '/me/documents',
  tutorOnly,
  upload.single('file'),
  ah(async (req, res) => {
    const userId = currentUser(req).id;
    const { docType } = body(req, z.object({ docType: z.enum(['QUALIFICATION', 'EXPERIENCE', 'ID_PROOF', 'OTHER']) }));
    if (!req.file) throw badRequest('Attach a PDF or image in the "file" field');
    const count = await query<{ n: number }>('SELECT count(*)::int AS n FROM tutor_documents WHERE tutor_id = $1', [userId]);
    if (count.rows[0].n >= MAX_DOCUMENTS) throw conflict(`You can upload up to ${MAX_DOCUMENTS} documents.`);
    const type = sniff(req.file.buffer, ['application/pdf', 'image/jpeg', 'image/png']);
    const key = await saveFile('documents', userId, req.file.buffer, type.ext);
    const originalName = req.file.originalname.replace(/[^\w.\- ]/g, '_').slice(0, 255) || `document.${type.ext}`;
    const { rows } = await query(
      `INSERT INTO tutor_documents (tutor_id, doc_type, storage_key, original_name, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, doc_type AS "docType", original_name AS "originalName", mime_type AS "mimeType",
                 size_bytes AS "sizeBytes", status, uploaded_at AS "uploadedAt"`,
      [userId, docType, key, originalName, type.mime, req.file.size],
    );
    res.status(201).json(rows[0]);
  }),
);

router.get(
  '/me/documents/:id/file',
  tutorOnly,
  ah(async (req, res) => {
    const { id } = params(req, idParam);
    const { rows } = await query<{ storage_key: string; mime_type: string; original_name: string }>(
      'SELECT storage_key, mime_type, original_name FROM tutor_documents WHERE id = $1 AND tutor_id = $2',
      [id, currentUser(req).id],
    );
    if (!rows[0]) throw notFound('Document');
    sendPrivateFile(res, rows[0]);
  }),
);

router.delete(
  '/me/documents/:id',
  tutorOnly,
  ah(async (req, res) => {
    const { id } = params(req, idParam);
    const { rows } = await query<{ storage_key: string }>(
      `DELETE FROM tutor_documents WHERE id = $1 AND tutor_id = $2 AND status <> 'APPROVED' RETURNING storage_key`,
      [id, currentUser(req).id],
    );
    if (!rows[0]) throw notFound('Document (approved documents cannot be deleted)');
    await deleteFile(rows[0].storage_key);
    res.status(204).end();
  }),
);

router.post(
  '/me/submit-for-verification',
  tutorOnly,
  ah(async (req, res) => {
    const userId = currentUser(req).id;
    const completeness = await tutors.checkCompleteness(userId);
    if (!completeness.complete) throw badRequest('Please complete your profile before submitting', completeness.missing);
    const { rowCount } = await query(
      `UPDATE tutor_profiles SET verification_status = 'PENDING', submitted_at = now(), verification_note = NULL
        WHERE user_id = $1 AND verification_status IN ('DRAFT', 'REJECTED')`,
      [userId],
    );
    if (!rowCount) throw conflict('Your profile is already submitted or approved.');
    res.json({ verificationStatus: 'PENDING' });
  }),
);

// =====================================================================
// Parent-facing discovery
// =====================================================================

const searchSchema = pageQuery.extend({
  classId: z.coerce.number().int().positive().optional(),
  subjectId: z.coerce.number().int().positive().optional(),
  boardId: z.coerce.number().int().positive().optional(),
  lat: latitude.optional(),
  lng: longitude.optional(),
  radiusKm: z.coerce.number().min(1).max(100).default(10),
  city: z.string().trim().max(80).optional(),
  pincode: pincode.optional(),
  mode: z.enum(['ONLINE', 'OFFLINE']).optional(),
  minFee: z.coerce.number().int().min(0).optional(),
  maxFee: z.coerce.number().int().min(0).optional(),
  minExperience: z.coerce.number().int().min(0).optional(),
  gender: z.enum(['MALE', 'FEMALE']).optional(),
  dayOfWeek: z.coerce.number().int().min(0).max(6).optional(),
  timeFrom: time24.optional(),
  timeTo: time24.optional(),
  q: z.string().trim().max(80).optional(),
  sort: z.enum(['relevance', 'distance', 'rating', 'fee_low', 'fee_high', 'experience']).default('relevance'),
});

router.get(
  '/search',
  requireRole('PARENT', 'ADMIN'),
  ah(async (req, res) => {
    const f = queryParams(req, searchSchema);
    if ((f.lat === undefined) !== (f.lng === undefined)) throw badRequest('lat and lng must be provided together');
    res.json(await tutors.searchTutors(f));
  }),
);

router.get(
  '/:id',
  requireRole('PARENT', 'ADMIN'),
  ah(async (req, res) => {
    const { id } = params(req, idParam);
    res.json(await tutors.getPublicProfile(id, currentUser(req)));
  }),
);

export function sendPrivateFile(
  res: import('express').Response,
  doc: { storage_key: string; mime_type: string; original_name: string },
) {
  const path = resolveKey(doc.storage_key);
  if (!fs.existsSync(path)) throw notFound('File');
  res.setHeader('Content-Type', doc.mime_type);
  res.setHeader('Content-Disposition', `inline; filename="${doc.original_name.replace(/"/g, '')}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  fs.createReadStream(path).pipe(res);
}

export default router;
