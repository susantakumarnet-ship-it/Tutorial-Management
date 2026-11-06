import { Router } from 'express';
import { query } from '../../db/pool';
import { authenticate, currentUser } from '../../middleware/auth';
import { params, queryParams } from '../../middleware/validate';
import { ah } from '../../utils/asyncHandler';
import { notFound } from '../../utils/errors';
import { paged, pageQuery } from '../../utils/pagination';
import { idParam } from '../../utils/validators';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  ah(async (req, res) => {
    const f = queryParams(req, pageQuery);
    const userId = currentUser(req).id;
    const [items, counts] = await Promise.all([
      query(
        `SELECT id, type, title, body, data, read_at AS "readAt", created_at AS "createdAt"
           FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [userId, f.pageSize, (f.page - 1) * f.pageSize],
      ),
      query<{ total: number; unread: number }>(
        `SELECT count(*)::int AS total, count(*) FILTER (WHERE read_at IS NULL)::int AS unread
           FROM notifications WHERE user_id = $1`,
        [userId],
      ),
    ]);
    res.json({ ...paged(items.rows, counts.rows[0].total, f), unread: counts.rows[0].unread });
  }),
);

router.get(
  '/unread-count',
  ah(async (req, res) => {
    const { rows } = await query<{ n: number }>(
      'SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL',
      [currentUser(req).id],
    );
    res.json({ unread: rows[0].n });
  }),
);

router.post(
  '/read-all',
  ah(async (req, res) => {
    await query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [currentUser(req).id]);
    res.status(204).end();
  }),
);

router.post(
  '/:id/read',
  ah(async (req, res) => {
    const { rowCount } = await query(
      'UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2',
      [params(req, idParam).id, currentUser(req).id],
    );
    if (!rowCount) throw notFound('Notification');
    res.status(204).end();
  }),
);

export default router;
