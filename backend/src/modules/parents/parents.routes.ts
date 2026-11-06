import { Router } from 'express';
import { z } from 'zod';
import { query, withTx } from '../../db/pool';
import { authenticate, currentUser, requireRole } from '../../middleware/auth';
import { body, params } from '../../middleware/validate';
import { ah } from '../../utils/asyncHandler';
import { conflict, notFound } from '../../utils/errors';
import { email, idParam, latitude, longitude, optionalText, personName, pincode } from '../../utils/validators';

const router = Router();
router.use(authenticate, requireRole('PARENT'));

const STUDENT_COLUMNS = `s.id, s.name, s.class_id AS "classId", c.name AS "className", s.board_id AS "boardId",
  b.code AS "boardCode", s.school_name AS "schoolName", s.gender, s.created_at AS "createdAt"`;

async function loadProfile(userId: string) {
  const { rows } = await query(
    `SELECT u.id, u.full_name AS "fullName", u.phone, u.email,
            p.address_line AS "addressLine", p.location_id AS "locationId", p.city, p.pincode,
            p.latitude, p.longitude
       FROM users u JOIN parent_profiles p ON p.user_id = u.id WHERE u.id = $1`,
    [userId],
  );
  if (!rows[0]) throw notFound('Parent profile');
  const students = await query(
    `SELECT ${STUDENT_COLUMNS} FROM students s
       JOIN classes c ON c.id = s.class_id LEFT JOIN boards b ON b.id = s.board_id
      WHERE s.parent_id = $1 AND s.is_active ORDER BY s.created_at`,
    [userId],
  );
  return { ...rows[0], students: students.rows };
}

router.get(
  '/me',
  ah(async (req, res) => {
    res.json(await loadProfile(currentUser(req).id));
  }),
);

const profileSchema = z.object({
  fullName: personName.optional(),
  email: email.optional(),
  addressLine: optionalText(255),
  locationId: z.number().int().positive().nullable().optional(),
  city: optionalText(80),
  pincode: pincode.nullable().optional(),
  latitude: latitude.nullable().optional(),
  longitude: longitude.nullable().optional(),
});

router.put(
  '/me',
  ah(async (req, res) => {
    const userId = currentUser(req).id;
    const input = body(req, profileSchema);
    if (input.email) {
      const taken = await query('SELECT 1 FROM users WHERE lower(email) = $1 AND id <> $2', [input.email, userId]);
      if (taken.rowCount) throw conflict('This email address is already registered with another account.');
    }
    await withTx(async (tx) => {
      await tx.query(
        'UPDATE users SET full_name = COALESCE($2, full_name), email = COALESCE($3, email) WHERE id = $1',
        [userId, input.fullName ?? null, input.email ?? null],
      );
      // Only fields present in the request are changed; explicit null clears a field.
      const sets: string[] = [];
      const values: unknown[] = [userId];
      const map: Record<string, string> = {
        addressLine: 'address_line',
        locationId: 'location_id',
        city: 'city',
        pincode: 'pincode',
        latitude: 'latitude',
        longitude: 'longitude',
      };
      for (const [key, column] of Object.entries(map)) {
        if (key in req.body) {
          values.push(input[key as keyof typeof input] ?? null);
          sets.push(`${column} = $${values.length}`);
        }
      }
      if (sets.length) await tx.query(`UPDATE parent_profiles SET ${sets.join(', ')} WHERE user_id = $1`, values);
    });
    res.json(await loadProfile(userId));
  }),
);

// ---------------- Children ----------------

const studentSchema = z.object({
  name: personName,
  classId: z.number().int().positive(),
  boardId: z.number().int().positive().nullable().optional(),
  schoolName: optionalText(160),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).nullable().optional(),
});

const MAX_CHILDREN = 10;

router.get(
  '/me/students',
  ah(async (req, res) => {
    res.json((await loadProfile(currentUser(req).id)).students);
  }),
);

router.post(
  '/me/students',
  ah(async (req, res) => {
    const userId = currentUser(req).id;
    const s = body(req, studentSchema);
    const count = await query<{ n: number }>('SELECT count(*)::int AS n FROM students WHERE parent_id = $1 AND is_active', [userId]);
    if (count.rows[0].n >= MAX_CHILDREN) throw conflict(`You can add up to ${MAX_CHILDREN} children.`);
    const { rows } = await query<{ id: string }>(
      `INSERT INTO students (parent_id, name, class_id, board_id, school_name, gender)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [userId, s.name, s.classId, s.boardId ?? null, s.schoolName, s.gender ?? null],
    );
    const created = await query(
      `SELECT ${STUDENT_COLUMNS} FROM students s JOIN classes c ON c.id = s.class_id
         LEFT JOIN boards b ON b.id = s.board_id WHERE s.id = $1`,
      [rows[0].id],
    );
    res.status(201).json(created.rows[0]);
  }),
);

router.put(
  '/me/students/:id',
  ah(async (req, res) => {
    const userId = currentUser(req).id;
    const { id } = params(req, idParam);
    const s = body(req, studentSchema);
    const result = await query(
      `UPDATE students SET name = $3, class_id = $4, board_id = $5, school_name = $6, gender = $7
        WHERE id = $1 AND parent_id = $2 AND is_active`,
      [id, userId, s.name, s.classId, s.boardId ?? null, s.schoolName, s.gender ?? null],
    );
    if (!result.rowCount) throw notFound('Student');
    const updated = await query(
      `SELECT ${STUDENT_COLUMNS} FROM students s JOIN classes c ON c.id = s.class_id
         LEFT JOIN boards b ON b.id = s.board_id WHERE s.id = $1`,
      [id],
    );
    res.json(updated.rows[0]);
  }),
);

router.delete(
  '/me/students/:id',
  ah(async (req, res) => {
    const userId = currentUser(req).id;
    const { id } = params(req, idParam);
    // Soft delete keeps booking/requirement history intact; open requirements for the child are closed.
    const result = await withTx(async (tx) => {
      const r = await tx.query('UPDATE students SET is_active = false WHERE id = $1 AND parent_id = $2 AND is_active', [id, userId]);
      await tx.query(`UPDATE tuition_requirements SET status = 'CLOSED' WHERE student_id = $1 AND status = 'OPEN'`, [id]);
      return r;
    });
    if (!result.rowCount) throw notFound('Student');
    res.status(204).end();
  }),
);

export default router;
