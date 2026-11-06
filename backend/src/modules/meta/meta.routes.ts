import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../db/pool';
import { queryParams } from '../../middleware/validate';
import { ah } from '../../utils/asyncHandler';

const router = Router();

/** All reference lists in one call so the app can cache them at start-up. */
router.get(
  '/',
  ah(async (_req, res) => {
    const [classes, boards, subjects] = await Promise.all([
      query('SELECT id, name FROM classes WHERE is_active ORDER BY sort_order'),
      query('SELECT id, name, code FROM boards WHERE is_active ORDER BY sort_order'),
      query('SELECT id, name FROM subjects WHERE is_active ORDER BY sort_order, name'),
    ]);
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ classes: classes.rows, boards: boards.rows, subjects: subjects.rows });
  }),
);

const locationQuery = z.object({
  q: z.string().trim().max(80).optional(),
  city: z.string().trim().max(80).optional(),
  pincode: z.string().trim().regex(/^\d{1,6}$/).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** Locality / city / pincode autocomplete. */
router.get(
  '/locations',
  ah(async (req, res) => {
    const q = queryParams(req, locationQuery);
    const where: string[] = ['is_active'];
    const params: unknown[] = [];
    if (q.q) {
      params.push(`%${q.q.toLowerCase()}%`);
      where.push(`(lower(locality) LIKE $${params.length} OR lower(city) LIKE $${params.length} OR pincode LIKE $${params.length})`);
    }
    if (q.city) {
      params.push(q.city.toLowerCase());
      where.push(`lower(city) = $${params.length}`);
    }
    if (q.pincode) {
      params.push(`${q.pincode}%`);
      where.push(`pincode LIKE $${params.length}`);
    }
    params.push(q.limit);
    const { rows } = await query(
      `SELECT id, locality, city, state, pincode, latitude, longitude
         FROM locations WHERE ${where.join(' AND ')}
        ORDER BY city, locality LIMIT $${params.length}`,
      params,
    );
    res.json(rows);
  }),
);

router.get(
  '/cities',
  ah(async (_req, res) => {
    const { rows } = await query<{ city: string }>('SELECT DISTINCT city FROM locations WHERE is_active ORDER BY city');
    res.json(rows.map((r) => r.city));
  }),
);

export default router;
