import { Router } from 'express';
import { z } from 'zod';
import { query, withTx } from '../../db/pool';
import { authenticate, currentUser, requireRole } from '../../middleware/auth';
import { body, params, queryParams } from '../../middleware/validate';
import { ah } from '../../utils/asyncHandler';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { pageQuery } from '../../utils/pagination';
import { idParam, latitude, longitude, optionalText, pincode, queryBool, uuid } from '../../utils/validators';
import * as svc from './requirements.service';

const router = Router();
router.use(authenticate);

const parentOnly = requireRole('PARENT');
const tutorOnly = requireRole('TUTOR');
const MAX_OPEN_REQUIREMENTS = 10;

const requirementSchema = z
  .object({
    studentId: uuid,
    classId: z.number().int().positive().optional(),
    boardId: z.number().int().positive().nullable().optional(),
    subjectIds: z.array(z.number().int().positive()).min(1, 'Select at least one subject').max(15),
    daysPerWeek: z.number().int().min(1).max(7),
    preferredTime: z.string().trim().min(2).max(60),
    preferredTutorGender: z.enum(['ANY', 'MALE', 'FEMALE']).default('ANY'),
    monthlyBudget: z.number().int().min(100).max(200000),
    mode: z.enum(['ONLINE', 'HOME', 'EITHER']),
    locationId: z.number().int().positive().nullable().optional(),
    locality: optionalText(120),
    city: z.string().trim().min(2).max(80).optional(),
    pincode: pincode.optional(),
    latitude: latitude.nullable().optional(),
    longitude: longitude.nullable().optional(),
    additionalNotes: optionalText(1000),
  })
  .refine((v) => (v.latitude == null) === (v.longitude == null), {
    message: 'latitude and longitude must be provided together',
  });

type RequirementInput = z.infer<typeof requirementSchema>;

/** Validates ownership of the child and completes class/board/location from the child and locality master. */
async function resolve(parentId: string, input: RequirementInput) {
  const student = await query<{ class_id: number; board_id: number | null }>(
    'SELECT class_id, board_id FROM students WHERE id = $1 AND parent_id = $2 AND is_active',
    [input.studentId, parentId],
  );
  if (!student.rows[0]) throw badRequest('Select one of your children');

  const loc = { locality: input.locality ?? null, city: input.city, pincode: input.pincode, latitude: input.latitude ?? null, longitude: input.longitude ?? null };
  if (input.locationId) {
    const { rows } = await query('SELECT locality, city, pincode, latitude, longitude FROM locations WHERE id = $1', [input.locationId]);
    if (!rows[0]) throw badRequest('Unknown location');
    loc.locality ??= rows[0].locality;
    loc.city ??= rows[0].city;
    loc.pincode ??= rows[0].pincode;
    loc.latitude ??= rows[0].latitude;
    loc.longitude ??= rows[0].longitude;
  }
  if (!loc.city || !loc.pincode) throw badRequest('City and pincode are required');
  if (input.mode !== 'ONLINE' && (loc.latitude === null || loc.longitude === null)) {
    throw badRequest('Pick your location on the map (or choose a locality) so nearby tutors can find you');
  }
  return {
    classId: input.classId ?? student.rows[0].class_id,
    boardId: input.boardId === undefined ? student.rows[0].board_id : input.boardId,
    ...loc,
  };
}

// =====================================================================
// Parent: post and manage requirements
// =====================================================================

router.post(
  '/',
  parentOnly,
  ah(async (req, res) => {
    const parentId = currentUser(req).id;
    const input = body(req, requirementSchema);
    const r = await resolve(parentId, input);
    const open = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM tuition_requirements WHERE parent_id = $1 AND status = 'OPEN'`,
      [parentId],
    );
    if (open.rows[0].n >= MAX_OPEN_REQUIREMENTS) {
      throw conflict(`You can have up to ${MAX_OPEN_REQUIREMENTS} open requirements. Close an old one first.`);
    }
    const id = await withTx(async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO tuition_requirements (parent_id, student_id, class_id, board_id, days_per_week, preferred_time,
            preferred_tutor_gender, monthly_budget, mode, location_id, locality, city, pincode, latitude, longitude, additional_notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
        [parentId, input.studentId, r.classId, r.boardId, input.daysPerWeek, input.preferredTime, input.preferredTutorGender,
          input.monthlyBudget, input.mode, input.locationId ?? null, r.locality, r.city, r.pincode, r.latitude, r.longitude,
          input.additionalNotes],
      );
      await tx.query('INSERT INTO requirement_subjects (requirement_id, subject_id) SELECT $1, unnest($2::int[])', [
        rows[0].id,
        [...new Set(input.subjectIds)],
      ]);
      return rows[0].id;
    });
    res.status(201).json(await svc.getOwned(id, parentId));
  }),
);

router.get(
  '/mine',
  parentOnly,
  ah(async (req, res) => {
    const { status } = queryParams(req, z.object({ status: z.enum(['OPEN', 'FULFILLED', 'CLOSED']).optional() }));
    res.json(await svc.listOwned(currentUser(req).id, status));
  }),
);

router.put(
  '/:id',
  parentOnly,
  ah(async (req, res) => {
    const parentId = currentUser(req).id;
    const { id } = params(req, idParam);
    const input = body(req, requirementSchema);
    const r = await resolve(parentId, input);
    await withTx(async (tx) => {
      const { rowCount } = await tx.query(
        `UPDATE tuition_requirements SET student_id=$3, class_id=$4, board_id=$5, days_per_week=$6, preferred_time=$7,
            preferred_tutor_gender=$8, monthly_budget=$9, mode=$10, location_id=$11, locality=$12, city=$13, pincode=$14,
            latitude=$15, longitude=$16, additional_notes=$17
          WHERE id = $1 AND parent_id = $2 AND status = 'OPEN'`,
        [id, parentId, input.studentId, r.classId, r.boardId, input.daysPerWeek, input.preferredTime, input.preferredTutorGender,
          input.monthlyBudget, input.mode, input.locationId ?? null, r.locality, r.city, r.pincode, r.latitude, r.longitude,
          input.additionalNotes],
      );
      if (!rowCount) throw notFound('Open requirement');
      await tx.query('DELETE FROM requirement_subjects WHERE requirement_id = $1', [id]);
      await tx.query('INSERT INTO requirement_subjects (requirement_id, subject_id) SELECT $1, unnest($2::int[])', [
        id,
        [...new Set(input.subjectIds)],
      ]);
    });
    res.json(await svc.getOwned(id, parentId));
  }),
);

router.post(
  '/:id/close',
  parentOnly,
  ah(async (req, res) => {
    const { id } = params(req, idParam);
    const { rowCount } = await query(
      `UPDATE tuition_requirements SET status = 'CLOSED' WHERE id = $1 AND parent_id = $2 AND status = 'OPEN'`,
      [id, currentUser(req).id],
    );
    if (!rowCount) throw notFound('Open requirement');
    res.json(await svc.getOwned(id, currentUser(req).id));
  }),
);

// =====================================================================
// Tutor: discover, view and save requirements
// =====================================================================

const discoverSchema = pageQuery.extend({
  lat: latitude.optional(),
  lng: longitude.optional(),
  radiusKm: z.coerce.number().min(1).max(100).optional(),
  city: z.string().trim().max(80).optional(),
  pincode: pincode.optional(),
  classId: z.coerce.number().int().positive().optional(),
  subjectId: z.coerce.number().int().positive().optional(),
  boardId: z.coerce.number().int().positive().optional(),
  minBudget: z.coerce.number().int().min(0).optional(),
  maxBudget: z.coerce.number().int().min(0).optional(),
  mode: z.enum(['ONLINE', 'HOME']).optional(),
  matchProfile: queryBool,
  savedOnly: queryBool,
  sort: z.enum(['newest', 'distance', 'budget_high']).default('newest'),
});

router.get(
  '/discover',
  tutorOnly,
  ah(async (req, res) => {
    const f = queryParams(req, discoverSchema);
    if ((f.lat === undefined) !== (f.lng === undefined)) throw badRequest('lat and lng must be provided together');
    res.json(await svc.discover(currentUser(req).id, f));
  }),
);

router.get(
  '/saved',
  tutorOnly,
  ah(async (req, res) => {
    const f = queryParams(req, pageQuery);
    res.json(await svc.discover(currentUser(req).id, { ...f, savedOnly: true, sort: 'newest' }));
  }),
);

router.put(
  '/:id/save',
  tutorOnly,
  ah(async (req, res) => {
    const { id } = params(req, idParam);
    const exists = await query(`SELECT 1 FROM tuition_requirements WHERE id = $1 AND status = 'OPEN'`, [id]);
    if (!exists.rowCount) throw notFound('Open requirement');
    await query('INSERT INTO saved_requirements (tutor_id, requirement_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
      currentUser(req).id,
      id,
    ]);
    res.json({ isSaved: true });
  }),
);

router.delete(
  '/:id/save',
  tutorOnly,
  ah(async (req, res) => {
    const { id } = params(req, idParam);
    await query('DELETE FROM saved_requirements WHERE tutor_id = $1 AND requirement_id = $2', [currentUser(req).id, id]);
    res.json({ isSaved: false });
  }),
);

/** Detail view - the owner sees everything, tutors see the privacy-safe version. */
router.get(
  '/:id',
  requireRole('PARENT', 'TUTOR'),
  ah(async (req, res) => {
    const { id } = params(req, idParam);
    const user = currentUser(req);
    res.json(user.role === 'PARENT' ? await svc.getOwned(id, user.id) : await svc.getForTutor(id, user.id));
  }),
);

export default router;
