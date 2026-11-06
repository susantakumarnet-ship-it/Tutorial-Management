import { query, withTx } from '../../db/pool';
import type { AuthUser } from '../../middleware/auth';
import { notify } from '../../services/notifications';
import { conflict, forbidden, notFound } from '../../utils/errors';
import { paged, type PageQuery } from '../../utils/pagination';

interface AppRow {
  id: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';
  initiated_by: 'TUTOR' | 'PARENT';
  message: string | null;
  proposed_fee: number | null;
  created_at: Date;
  responded_at: Date | null;
  requirement_id: string | null;
  tutor_id: string;
  parent_id: string;
  student_id: string | null;
  // joined
  tutor_name: string;
  tutor_phone: string;
  tutor_email: string | null;
  tutor_photo: string | null;
  tutor_headline: string | null;
  tutor_experience: number;
  tutor_rating: number;
  tutor_reviews: number;
  tutor_fee: number | null;
  parent_name: string;
  parent_phone: string;
  parent_email: string | null;
  student_name: string | null;
  student_class: string | null;
  req_class: string | null;
  req_subjects: { id: number; name: string }[] | null;
  req_city: string | null;
  req_locality: string | null;
  req_mode: string | null;
  req_budget: number | null;
  req_time: string | null;
  booking_id: string | null;
  booking_status: string | null;
  conversation_id: string | null;
  _total?: number;
}

const SELECT = `
  SELECT a.*, tu.full_name AS tutor_name, tu.phone AS tutor_phone, tu.email AS tutor_email,
         tp.photo_url AS tutor_photo, tp.headline AS tutor_headline, tp.experience_years AS tutor_experience,
         tp.avg_rating AS tutor_rating, tp.review_count AS tutor_reviews, tp.monthly_fee AS tutor_fee,
         pu.full_name AS parent_name, pu.phone AS parent_phone, pu.email AS parent_email,
         st.name AS student_name, sc.name AS student_class,
         rc.name AS req_class, r.city AS req_city, r.locality AS req_locality, r.mode AS req_mode,
         r.monthly_budget AS req_budget, r.preferred_time AS req_time,
         (SELECT json_agg(json_build_object('id', s.id, 'name', s.name) ORDER BY s.sort_order)
            FROM requirement_subjects rs JOIN subjects s ON s.id = rs.subject_id WHERE rs.requirement_id = a.requirement_id) AS req_subjects,
         bk.id AS booking_id, bk.status AS booking_status, cv.id AS conversation_id
    FROM tutor_applications a
    JOIN users tu ON tu.id = a.tutor_id
    JOIN tutor_profiles tp ON tp.user_id = a.tutor_id
    JOIN users pu ON pu.id = a.parent_id
    LEFT JOIN students st ON st.id = a.student_id
    LEFT JOIN classes sc ON sc.id = st.class_id
    LEFT JOIN tuition_requirements r ON r.id = a.requirement_id
    LEFT JOIN classes rc ON rc.id = r.class_id
    LEFT JOIN bookings bk ON bk.application_id = a.id
    LEFT JOIN conversations cv ON cv.application_id = a.id`;

/**
 * Shapes an application for the viewer. Contact details and the child's name are released only once
 * the application has been accepted, and only to the two parties involved.
 */
function present(a: AppRow, viewer: AuthUser) {
  const accepted = a.status === 'ACCEPTED';
  const isParent = viewer.id === a.parent_id;
  const recipientId = a.initiated_by === 'TUTOR' ? a.parent_id : a.tutor_id;
  return {
    id: a.id,
    status: a.status,
    initiatedBy: a.initiated_by,
    direction: viewer.id === recipientId ? 'INCOMING' : 'OUTGOING',
    message: a.message,
    proposedFee: a.proposed_fee,
    createdAt: a.created_at,
    respondedAt: a.responded_at,
    canRespond: viewer.id === recipientId && a.status === 'PENDING',
    canWithdraw: viewer.id !== recipientId && a.status === 'PENDING',
    requirement: a.requirement_id
      ? {
          id: a.requirement_id,
          className: a.req_class,
          subjects: a.req_subjects ?? [],
          city: a.req_city,
          locality: a.req_locality,
          mode: a.req_mode,
          monthlyBudget: a.req_budget,
          preferredTime: a.req_time,
        }
      : null,
    tutor: {
      id: a.tutor_id,
      fullName: a.tutor_name,
      photoUrl: a.tutor_photo,
      headline: a.tutor_headline,
      experienceYears: a.tutor_experience,
      avgRating: a.tutor_rating,
      reviewCount: a.tutor_reviews,
      monthlyFee: a.tutor_fee,
      contact: accepted && isParent ? { phone: a.tutor_phone, email: a.tutor_email } : null,
    },
    parent: {
      id: a.parent_id,
      // Tutors only see the parent's first name until they are accepted.
      fullName: isParent || accepted ? a.parent_name : a.parent_name.split(' ')[0],
      contact: accepted && !isParent ? { phone: a.parent_phone, email: a.parent_email } : null,
    },
    student: a.student_id
      ? { id: a.student_id, name: isParent || accepted ? a.student_name : null, className: a.student_class }
      : null,
    bookingId: a.booking_id,
    bookingStatus: a.booking_status,
    conversationId: a.conversation_id,
  };
}

async function load(id: string) {
  const { rows } = await query<AppRow>(`${SELECT} WHERE a.id = $1`, [id]);
  return rows[0];
}

export async function getForUser(id: string, viewer: AuthUser) {
  const a = await load(id);
  if (!a || (a.tutor_id !== viewer.id && a.parent_id !== viewer.id && viewer.role !== 'ADMIN')) {
    throw notFound('Application');
  }
  return present(a, viewer);
}

export async function list(
  viewer: AuthUser,
  f: PageQuery & { box?: 'incoming' | 'outgoing'; status?: string; requirementId?: string },
) {
  const params: unknown[] = [viewer.id];
  const where = [viewer.role === 'TUTOR' ? 'a.tutor_id = $1' : 'a.parent_id = $1'];
  // "Incoming" means the other party started it.
  const otherSide = viewer.role === 'TUTOR' ? 'PARENT' : 'TUTOR';
  if (f.box === 'incoming') where.push(`a.initiated_by = '${otherSide}'`);
  if (f.box === 'outgoing') where.push(`a.initiated_by <> '${otherSide}'`);
  if (f.status) {
    params.push(f.status);
    where.push(`a.status = $${params.length}`);
  }
  if (f.requirementId) {
    params.push(f.requirementId);
    where.push(`a.requirement_id = $${params.length}`);
  }
  params.push(f.pageSize, (f.page - 1) * f.pageSize);
  const { rows } = await query<AppRow>(
    `SELECT * FROM (${SELECT.replace('SELECT a.*,', 'SELECT a.*, count(*) OVER () AS _total,')}
       WHERE ${where.join(' AND ')}) x
     ORDER BY (status = 'PENDING') DESC, created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return paged(rows.map((r) => present(r, viewer)), rows[0]?._total ?? 0, f);
}

export async function applyToRequirement(tutorId: string, requirementId: string, message: string | null, proposedFee: number | null) {
  const tutor = await query<{ verification_status: string; gender: string | null; full_name: string }>(
    `SELECT tp.verification_status, tp.gender, u.full_name FROM tutor_profiles tp JOIN users u ON u.id = tp.user_id
      WHERE tp.user_id = $1`,
    [tutorId],
  );
  const t = tutor.rows[0];
  if (!t || t.verification_status !== 'APPROVED') {
    throw forbidden('Your profile must be verified by the Smart Tuition team before you can apply.');
  }
  const req = await query<{ parent_id: string; student_id: string; status: string; preferred_tutor_gender: string; class_name: string }>(
    `SELECT r.parent_id, r.student_id, r.status, r.preferred_tutor_gender, c.name AS class_name
       FROM tuition_requirements r JOIN classes c ON c.id = r.class_id
      WHERE r.id = $1
        AND NOT EXISTS (SELECT 1 FROM user_blocks ub WHERE ub.blocker_id = r.parent_id AND ub.blocked_id = $2)`,
    [requirementId, tutorId],
  );
  const r = req.rows[0];
  if (!r) throw notFound('Requirement');
  if (r.status !== 'OPEN') throw conflict('This requirement is no longer accepting applications.');
  if (r.preferred_tutor_gender !== 'ANY' && r.preferred_tutor_gender !== t.gender) {
    throw forbidden('This parent has requested a tutor of a different gender.');
  }

  const id = await withTx(async (tx) => {
    const ins = await tx.query<{ id: string }>(
      `INSERT INTO tutor_applications (requirement_id, tutor_id, parent_id, student_id, initiated_by, message, proposed_fee)
       VALUES ($1, $2, $3, $4, 'TUTOR', $5, $6)
       ON CONFLICT (requirement_id, tutor_id) WHERE requirement_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [requirementId, tutorId, r.parent_id, r.student_id, message, proposedFee],
    );
    if (!ins.rows[0]) throw conflict('You have already applied for this tuition.');
    await notify(
      r.parent_id,
      'APPLICATION_RECEIVED',
      'New tutor application',
      `${t.full_name} has applied for your ${r.class_name} tuition requirement.`,
      { applicationId: ins.rows[0].id, requirementId },
      tx,
    );
    return ins.rows[0].id;
  });
  return id;
}

export async function requestTutor(parentId: string, tutorId: string, studentId: string, message: string | null) {
  const student = await query<{ name: string; class_name: string }>(
    `SELECT s.name, c.name AS class_name FROM students s JOIN classes c ON c.id = s.class_id
      WHERE s.id = $1 AND s.parent_id = $2 AND s.is_active`,
    [studentId, parentId],
  );
  if (!student.rows[0]) throw notFound('Student');
  const tutor = await query(
    `SELECT 1 FROM tutor_profiles tp JOIN users u ON u.id = tp.user_id
      WHERE tp.user_id = $1 AND tp.verification_status = 'APPROVED' AND tp.is_available AND u.status = 'ACTIVE'`,
    [tutorId],
  );
  if (!tutor.rowCount) throw notFound('Tutor');
  const parent = await query<{ full_name: string }>('SELECT full_name FROM users WHERE id = $1', [parentId]);

  return withTx(async (tx) => {
    const ins = await tx.query<{ id: string }>(
      `INSERT INTO tutor_applications (tutor_id, parent_id, student_id, initiated_by, message)
       VALUES ($1, $2, $3, 'PARENT', $4)
       ON CONFLICT (parent_id, tutor_id) WHERE requirement_id IS NULL AND status = 'PENDING' DO NOTHING
       RETURNING id`,
      [tutorId, parentId, studentId, message],
    );
    if (!ins.rows[0]) throw conflict('You already have a pending request with this tutor.');
    await notify(
      tutorId,
      'TUITION_REQUEST_RECEIVED',
      'New tuition request',
      `${parent.rows[0].full_name.split(' ')[0]} is looking for a tutor for a ${student.rows[0].class_name} student.`,
      { applicationId: ins.rows[0].id },
      tx,
    );
    return ins.rows[0].id;
  });
}

/** Accept or reject - only the party who did NOT start the application may respond. */
export async function respond(id: string, viewer: AuthUser, decision: 'ACCEPTED' | 'REJECTED') {
  await withTx(async (tx) => {
    const { rows } = await tx.query<AppRow & { req_status: string | null }>(
      `SELECT a.*, r.status AS req_status FROM tutor_applications a
         LEFT JOIN tuition_requirements r ON r.id = a.requirement_id
        WHERE a.id = $1 FOR UPDATE OF a`,
      [id],
    );
    const a = rows[0];
    const recipientId = a && (a.initiated_by === 'TUTOR' ? a.parent_id : a.tutor_id);
    if (!a || recipientId !== viewer.id) throw notFound('Application');
    if (a.status !== 'PENDING') throw conflict(`This application has already been ${a.status.toLowerCase()}.`);
    if (decision === 'ACCEPTED' && a.req_status && a.req_status !== 'OPEN') {
      throw conflict('This requirement is no longer open.');
    }

    await tx.query('UPDATE tutor_applications SET status = $2, responded_at = now() WHERE id = $1', [id, decision]);

    if (decision === 'ACCEPTED') {
      await tx.query(
        `INSERT INTO conversations (application_id, parent_id, tutor_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [id, a.parent_id, a.tutor_id],
      );
      await tx.query(
        `INSERT INTO bookings (application_id, parent_id, tutor_id, student_id, requirement_id, monthly_fee)
         SELECT $1, $2, $3, $4, $5, COALESCE($6, tp.monthly_fee) FROM tutor_profiles tp WHERE tp.user_id = $3
         ON CONFLICT (application_id) DO NOTHING`,
        [id, a.parent_id, a.tutor_id, a.student_id, a.requirement_id, a.proposed_fee],
      );
    }

    const responder = await tx.query<{ full_name: string }>('SELECT full_name FROM users WHERE id = $1', [viewer.id]);
    const initiatorId = a.initiated_by === 'TUTOR' ? a.tutor_id : a.parent_id;
    const name = responder.rows[0].full_name;
    if (decision === 'ACCEPTED') {
      await notify(initiatorId, 'APPLICATION_ACCEPTED', 'Request accepted',
        `${name} accepted your request. You can now chat and schedule a demo class.`, { applicationId: id }, tx);
    } else {
      await notify(initiatorId, 'APPLICATION_REJECTED', 'Request declined',
        `${name} has declined your request.`, { applicationId: id }, tx);
    }
  });
  return getForUser(id, viewer);
}

export async function withdraw(id: string, viewer: AuthUser) {
  const { rowCount } = await query(
    `UPDATE tutor_applications SET status = 'WITHDRAWN', responded_at = now()
      WHERE id = $1 AND status = 'PENDING'
        AND ((initiated_by = 'TUTOR' AND tutor_id = $2) OR (initiated_by = 'PARENT' AND parent_id = $2))`,
    [id, viewer.id],
  );
  if (!rowCount) throw notFound('Pending application');
  return getForUser(id, viewer);
}
