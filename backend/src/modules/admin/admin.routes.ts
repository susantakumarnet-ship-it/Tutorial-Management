import { Router } from 'express';
import { z } from 'zod';
import { query, withTx } from '../../db/pool';
import { authenticate, currentUser, requireRole } from '../../middleware/auth';
import { body, params, queryParams } from '../../middleware/validate';
import { audit } from '../../services/audit';
import { notify } from '../../services/notifications';
import { ah } from '../../utils/asyncHandler';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { paged, pageQuery } from '../../utils/pagination';
import { idParam } from '../../utils/validators';
import { sendPrivateFile } from '../tutors/tutors.routes';
import { getOwnProfile } from '../tutors/tutors.service';

const router = Router();
router.use(authenticate, requireRole('ADMIN'));

router.get(
  '/stats',
  ah(async (_req, res) => {
    const { rows } = await query(`
      SELECT
        (SELECT count(*)::int FROM users WHERE role = 'PARENT' AND status <> 'DELETED') AS parents,
        (SELECT count(*)::int FROM users WHERE role = 'TUTOR' AND status <> 'DELETED') AS tutors,
        (SELECT count(*)::int FROM students WHERE is_active) AS students,
        (SELECT count(*)::int FROM tutor_profiles tp JOIN users u ON u.id = tp.user_id WHERE u.status <> 'DELETED' AND tp.verification_status = 'APPROVED') AS "approvedTutors",
        (SELECT count(*)::int FROM tutor_profiles tp JOIN users u ON u.id = tp.user_id WHERE u.status <> 'DELETED' AND tp.verification_status = 'PENDING') AS "pendingTutors",
        (SELECT count(*)::int FROM tuition_requirements WHERE status = 'OPEN') AS "openRequirements",
        (SELECT count(*)::int FROM tuition_requirements WHERE status = 'FULFILLED') AS "fulfilledRequirements",
        (SELECT count(*)::int FROM tutor_applications) AS applications,
        (SELECT count(*)::int FROM tutor_applications WHERE status = 'ACCEPTED') AS "acceptedApplications",
        (SELECT count(*)::int FROM users WHERE status = 'BLOCKED') AS "blockedUsers",
        (SELECT count(*)::int FROM complaints WHERE status IN ('OPEN', 'IN_REVIEW')) AS "openComplaints",
        (SELECT COALESCE(sum(amount_paise), 0)::bigint FROM payments WHERE status = 'PAID') AS "revenuePaise"`);
    const signups = await query(
      `SELECT to_char(d, 'YYYY-MM-DD') AS date,
              (SELECT count(*)::int FROM users u WHERE u.role = 'PARENT' AND u.created_at::date = d) AS parents,
              (SELECT count(*)::int FROM users u WHERE u.role = 'TUTOR' AND u.created_at::date = d) AS tutors
         FROM generate_series(current_date - 13, current_date, interval '1 day') AS d ORDER BY d`,
    );
    res.json({ ...rows[0], signups: signups.rows });
  }),
);

// ---------------- Tutor verification ----------------

router.get(
  '/tutors',
  ah(async (req, res) => {
    const f = queryParams(
      req,
      pageQuery.extend({
        status: z.enum(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED']).optional(),
        q: z.string().trim().max(80).optional(),
      }),
    );
    const params: unknown[] = [];
    const where = ['true'];
    if (f.status) {
      params.push(f.status);
      where.push(`tp.verification_status = $${params.length}`);
    }
    if (f.q) {
      params.push(`%${f.q.toLowerCase()}%`);
      where.push(`(lower(u.full_name) LIKE $${params.length} OR u.phone LIKE $${params.length} OR lower(u.email) LIKE $${params.length})`);
    }
    params.push(f.pageSize, (f.page - 1) * f.pageSize);
    const { rows } = await query<{ _total: number }>(
      `SELECT u.id, u.full_name AS "fullName", u.phone, u.email, u.status AS "accountStatus",
              tp.photo_url AS "photoUrl", tp.city, tp.experience_years AS "experienceYears",
              tp.verification_status AS "verificationStatus", tp.submitted_at AS "submittedAt",
              tp.verified_at AS "verifiedAt", u.created_at AS "createdAt",
              (SELECT count(*)::int FROM tutor_documents d WHERE d.tutor_id = u.id) AS "documentCount",
              count(*) OVER () AS _total
         FROM users u JOIN tutor_profiles tp ON tp.user_id = u.id
        WHERE ${where.join(' AND ')}
        ORDER BY (tp.verification_status = 'PENDING') DESC, tp.submitted_at ASC NULLS LAST, u.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    res.json(paged(rows.map(({ _total, ...r }) => r), rows[0]?._total ?? 0, f));
  }),
);

router.get(
  '/tutors/:id',
  ah(async (req, res) => {
    res.json(await getOwnProfile(params(req, idParam).id));
  }),
);

const decisionSchema = z.object({ note: z.string().trim().max(1000).optional() });

router.post(
  '/tutors/:id/approve',
  ah(async (req, res) => {
    const { id } = params(req, idParam);
    const { note } = body(req, decisionSchema);
    const adminId = currentUser(req).id;
    await withTx(async (tx) => {
      const { rowCount } = await tx.query(
        `UPDATE tutor_profiles SET verification_status = 'APPROVED', verification_note = $2, verified_at = now(), verified_by = $3
          WHERE user_id = $1 AND verification_status IN ('PENDING', 'REJECTED')`,
        [id, note ?? null, adminId],
      );
      if (!rowCount) throw conflict('Only pending or rejected profiles can be approved.');
      await tx.query(
        `UPDATE tutor_documents SET status = 'APPROVED', reviewed_by = $2, reviewed_at = now()
          WHERE tutor_id = $1 AND status = 'PENDING'`,
        [id, adminId],
      );
      await audit(adminId, 'TUTOR_APPROVED', 'tutor', id, { note }, tx);
      await notify(id, 'TUTOR_APPROVED', 'Profile verified',
        'Congratulations! Your profile is now verified and visible to parents.', {}, tx);
    });
    res.json(await getOwnProfile(id));
  }),
);

router.post(
  '/tutors/:id/reject',
  ah(async (req, res) => {
    const { id } = params(req, idParam);
    const { note } = body(req, decisionSchema);
    if (!note) throw badRequest('Please give a reason so the tutor can fix their profile');
    const adminId = currentUser(req).id;
    await withTx(async (tx) => {
      const { rowCount } = await tx.query(
        `UPDATE tutor_profiles SET verification_status = 'REJECTED', verification_note = $2, verified_at = NULL, verified_by = $3
          WHERE user_id = $1 AND verification_status IN ('PENDING', 'APPROVED')`,
        [id, note, adminId],
      );
      if (!rowCount) throw conflict('Only pending or approved profiles can be rejected.');
      await audit(adminId, 'TUTOR_REJECTED', 'tutor', id, { note }, tx);
      await notify(id, 'TUTOR_REJECTED', 'Profile needs changes', `Your profile was not approved: ${note}`, {}, tx);
    });
    res.json(await getOwnProfile(id));
  }),
);

router.get(
  '/documents/:id/file',
  ah(async (req, res) => {
    const { rows } = await query<{ storage_key: string; mime_type: string; original_name: string }>(
      'SELECT storage_key, mime_type, original_name FROM tutor_documents WHERE id = $1',
      [params(req, idParam).id],
    );
    if (!rows[0]) throw notFound('Document');
    sendPrivateFile(res, rows[0]);
  }),
);

router.post(
  '/documents/:id/review',
  ah(async (req, res) => {
    const { id } = params(req, idParam);
    const input = body(req, z.object({ status: z.enum(['APPROVED', 'REJECTED']), note: z.string().trim().max(500).optional() }));
    if (input.status === 'REJECTED' && !input.note) throw badRequest('Please give a reason so the tutor can upload a better document');
    const adminId = currentUser(req).id;
    const { rows } = await query(
      `UPDATE tutor_documents SET status = $2, review_note = $3, reviewed_by = $4, reviewed_at = now()
        WHERE id = $1 RETURNING id, tutor_id AS "tutorId", status`,
      [id, input.status, input.note ?? null, adminId],
    );
    if (!rows[0]) throw notFound('Document');
    await audit(adminId, `DOCUMENT_${input.status}`, 'tutor_document', id, { note: input.note });
    res.json(rows[0]);
  }),
);

// ---------------- Users ----------------

router.get(
  '/users',
  ah(async (req, res) => {
    const f = queryParams(
      req,
      pageQuery.extend({
        role: z.enum(['PARENT', 'TUTOR', 'ADMIN']).optional(),
        status: z.enum(['ACTIVE', 'BLOCKED', 'DELETED']).optional(),
        q: z.string().trim().max(80).optional(),
      }),
    );
    const params: unknown[] = [];
    const where = ['true'];
    for (const [key, column] of [['role', 'role'], ['status', 'status']] as const) {
      if (f[key]) {
        params.push(f[key]);
        where.push(`${column} = $${params.length}`);
      }
    }
    if (f.q) {
      params.push(`%${f.q.toLowerCase()}%`);
      where.push(`(lower(full_name) LIKE $${params.length} OR phone LIKE $${params.length} OR lower(email) LIKE $${params.length})`);
    }
    params.push(f.pageSize, (f.page - 1) * f.pageSize);
    const { rows } = await query<{ _total: number }>(
      `SELECT id, role, full_name AS "fullName", phone, email, status, blocked_reason AS "blockedReason",
              phone_verified AS "phoneVerified", last_login_at AS "lastLoginAt", created_at AS "createdAt",
              count(*) OVER () AS _total
         FROM users WHERE ${where.join(' AND ')}
        ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    res.json(paged(rows.map(({ _total, ...r }) => r), rows[0]?._total ?? 0, f));
  }),
);

router.post(
  '/users/:id/block',
  ah(async (req, res) => {
    const { id } = params(req, idParam);
    const { reason } = body(req, z.object({ reason: z.string().trim().min(3).max(500) }));
    const adminId = currentUser(req).id;
    if (id === adminId) throw badRequest('You cannot block your own account');
    await withTx(async (tx) => {
      const { rowCount } = await tx.query(
        `UPDATE users SET status = 'BLOCKED', blocked_reason = $2 WHERE id = $1 AND role <> 'ADMIN' AND status = 'ACTIVE'`,
        [id, reason],
      );
      if (!rowCount) throw conflict('User not found, already blocked, or is an administrator.');
      // Kill all sessions immediately.
      await tx.query(`UPDATE refresh_tokens SET revoked_at = now(), revoked_reason = 'BLOCKED' WHERE user_id = $1 AND revoked_at IS NULL`, [id]);
      await audit(adminId, 'USER_BLOCKED', 'user', id, { reason }, tx);
    });
    res.json({ id, status: 'BLOCKED' });
  }),
);

router.post(
  '/users/:id/unblock',
  ah(async (req, res) => {
    const { id } = params(req, idParam);
    const adminId = currentUser(req).id;
    const { rowCount } = await query(
      `UPDATE users SET status = 'ACTIVE', blocked_reason = NULL WHERE id = $1 AND status = 'BLOCKED'`,
      [id],
    );
    if (!rowCount) throw conflict('User is not blocked.');
    await audit(adminId, 'USER_UNBLOCKED', 'user', id);
    res.json({ id, status: 'ACTIVE' });
  }),
);

// ---------------- Requirements ----------------

router.get(
  '/requirements',
  ah(async (req, res) => {
    const f = queryParams(req, pageQuery.extend({ status: z.enum(['OPEN', 'FULFILLED', 'CLOSED']).optional() }));
    const params: unknown[] = [f.status ?? null, f.pageSize, (f.page - 1) * f.pageSize];
    const { rows } = await query<{ _total: number }>(
      `SELECT r.id, r.status, r.city, r.locality, r.pincode, r.mode, r.monthly_budget AS "monthlyBudget",
              c.name AS "className", u.full_name AS "parentName", u.phone AS "parentPhone", r.created_at AS "createdAt",
              (SELECT string_agg(s.name, ', ' ORDER BY s.sort_order) FROM requirement_subjects rs
                 JOIN subjects s ON s.id = rs.subject_id WHERE rs.requirement_id = r.id) AS subjects,
              (SELECT count(*)::int FROM tutor_applications a WHERE a.requirement_id = r.id) AS "applicationCount",
              count(*) OVER () AS _total
         FROM tuition_requirements r JOIN classes c ON c.id = r.class_id JOIN users u ON u.id = r.parent_id
        WHERE ($1::requirement_status IS NULL OR r.status = $1)
        ORDER BY r.created_at DESC LIMIT $2 OFFSET $3`,
      params,
    );
    res.json(paged(rows.map(({ _total, ...r }) => r), rows[0]?._total ?? 0, f));
  }),
);

router.post(
  '/requirements/:id/close',
  ah(async (req, res) => {
    const { id } = params(req, idParam);
    const { rowCount } = await query(`UPDATE tuition_requirements SET status = 'CLOSED' WHERE id = $1 AND status = 'OPEN'`, [id]);
    if (!rowCount) throw conflict('Requirement is not open.');
    await audit(currentUser(req).id, 'REQUIREMENT_CLOSED', 'requirement', id);
    res.json({ id, status: 'CLOSED' });
  }),
);

export default router;
