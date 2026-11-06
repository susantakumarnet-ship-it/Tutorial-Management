import { query } from '../../db/pool';
import { boundingBox, displayDistanceKm, fuzz, haversineSql } from '../../utils/geo';
import { notFound } from '../../utils/errors';
import { paged, type PageQuery } from '../../utils/pagination';

const SUBJECTS = `COALESCE((SELECT json_agg(json_build_object('id', s.id, 'name', s.name) ORDER BY s.sort_order)
  FROM requirement_subjects rs JOIN subjects s ON s.id = rs.subject_id WHERE rs.requirement_id = r.id), '[]')`;

/** Columns that are safe to show to any tutor - no names, contact details or exact coordinates. */
const PUBLIC_COLUMNS = `r.id, r.class_id AS "classId", c.name AS "className", r.board_id AS "boardId", b.code AS "boardCode",
  r.days_per_week AS "daysPerWeek", r.preferred_time AS "preferredTime",
  r.preferred_tutor_gender AS "preferredTutorGender", r.monthly_budget AS "monthlyBudget", r.mode,
  r.locality, r.city, r.pincode, r.latitude, r.longitude, r.additional_notes AS "additionalNotes",
  r.status, r.created_at AS "createdAt", st.gender AS "studentGender", ${SUBJECTS} AS subjects`;

const JOINS = `FROM tuition_requirements r
  JOIN classes c ON c.id = r.class_id
  LEFT JOIN boards b ON b.id = r.board_id
  JOIN students st ON st.id = r.student_id`;

type Row = Record<string, unknown> & { latitude: number | null; longitude: number | null; distanceKm?: number | null };

function toPublic(row: Row) {
  const { latitude, longitude, distanceKm, ...rest } = row;
  return {
    ...rest,
    approxLatitude: fuzz(latitude),
    approxLongitude: fuzz(longitude),
    distanceKm: displayDistanceKm(distanceKm),
  };
}

/** A parent's own requirement, with every detail plus application counts. */
export async function getOwned(id: string, parentId: string) {
  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS}, r.student_id AS "studentId", st.name AS "studentName", r.location_id AS "locationId",
            r.fulfilled_at AS "fulfilledAt", r.updated_at AS "updatedAt",
            (SELECT count(*)::int FROM tutor_applications a WHERE a.requirement_id = r.id) AS "applicationCount",
            (SELECT count(*)::int FROM tutor_applications a WHERE a.requirement_id = r.id AND a.status = 'PENDING') AS "pendingApplications"
       ${JOINS} WHERE r.id = $1 AND r.parent_id = $2`,
    [id, parentId],
  );
  if (!rows[0]) throw notFound('Requirement');
  return rows[0];
}

export async function listOwned(parentId: string, status?: string) {
  const { rows } = await query(
    `SELECT ${PUBLIC_COLUMNS}, r.student_id AS "studentId", st.name AS "studentName",
            (SELECT count(*)::int FROM tutor_applications a WHERE a.requirement_id = r.id) AS "applicationCount",
            (SELECT count(*)::int FROM tutor_applications a WHERE a.requirement_id = r.id AND a.status = 'PENDING') AS "pendingApplications"
       ${JOINS} WHERE r.parent_id = $1 AND ($2::requirement_status IS NULL OR r.status = $2)
      ORDER BY r.created_at DESC`,
    [parentId, status ?? null],
  );
  return rows;
}

interface TutorContext {
  gender: string | null;
  teachingMode: string;
  latitude: number | null;
  longitude: number | null;
  serviceRadiusKm: number;
  verificationStatus: string;
}

export async function tutorContext(tutorId: string): Promise<TutorContext> {
  const { rows } = await query<TutorContext>(
    `SELECT gender, teaching_mode AS "teachingMode", latitude, longitude, service_radius_km AS "serviceRadiusKm",
            verification_status AS "verificationStatus"
       FROM tutor_profiles WHERE user_id = $1`,
    [tutorId],
  );
  if (!rows[0]) throw notFound('Tutor profile');
  return rows[0];
}

export interface DiscoverFilters extends PageQuery {
  lat?: number;
  lng?: number;
  radiusKm?: number;
  city?: string;
  pincode?: string;
  classId?: number;
  subjectId?: number;
  boardId?: number;
  minBudget?: number;
  maxBudget?: number;
  mode?: 'ONLINE' | 'HOME';
  matchProfile?: boolean;
  savedOnly?: boolean;
  sort: 'newest' | 'distance' | 'budget_high';
}

/**
 * Open requirements a tutor may apply to. The search centre defaults to the tutor's own teaching
 * location and service radius. Online requirements are shown regardless of distance to tutors who
 * teach online. Gender preferences and parent-side blocks are always respected.
 */
export async function discover(tutorId: string, f: DiscoverFilters) {
  const me = await tutorContext(tutorId);
  const params: unknown[] = [tutorId];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const where = [
    `r.status = 'OPEN'`,
    `pu.status = 'ACTIVE'`,
    `NOT EXISTS (SELECT 1 FROM user_blocks ub WHERE ub.blocker_id = r.parent_id AND ub.blocked_id = $1)`,
    `(r.preferred_tutor_gender = 'ANY' OR r.preferred_tutor_gender::text = ${p(me.gender ?? '')})`,
  ];

  if (f.classId) where.push(`r.class_id = ${p(f.classId)}`);
  if (f.boardId) where.push(`r.board_id = ${p(f.boardId)}`);
  if (f.subjectId) where.push(`EXISTS (SELECT 1 FROM requirement_subjects x WHERE x.requirement_id = r.id AND x.subject_id = ${p(f.subjectId)})`);
  if (f.minBudget !== undefined) where.push(`r.monthly_budget >= ${p(f.minBudget)}`);
  if (f.maxBudget !== undefined) where.push(`r.monthly_budget <= ${p(f.maxBudget)}`);
  if (f.mode === 'ONLINE') where.push(`r.mode IN ('ONLINE', 'EITHER')`);
  if (f.mode === 'HOME') where.push(`r.mode IN ('HOME', 'EITHER')`);
  if (f.savedOnly) where.push(`EXISTS (SELECT 1 FROM saved_requirements sv WHERE sv.requirement_id = r.id AND sv.tutor_id = $1)`);
  if (f.matchProfile) {
    where.push(`EXISTS (SELECT 1 FROM tutor_classes tc WHERE tc.tutor_id = $1 AND tc.class_id = r.class_id)`);
    where.push(`EXISTS (SELECT 1 FROM requirement_subjects x JOIN tutor_subjects ts ON ts.subject_id = x.subject_id
                         WHERE x.requirement_id = r.id AND ts.tutor_id = $1)`);
  }

  const lat = f.lat ?? (f.city || f.pincode ? undefined : me.latitude ?? undefined);
  const lng = f.lng ?? (f.city || f.pincode ? undefined : me.longitude ?? undefined);
  let distance = 'NULL::double precision';
  if (lat !== undefined && lng !== undefined) {
    const radius = f.radiusKm ?? me.serviceRadiusKm;
    distance = haversineSql('r.latitude', 'r.longitude', `${p(lat)}::float8`, `${p(lng)}::float8`);
    // Saved items are shown regardless of distance - the tutor picked them deliberately.
    if (!f.savedOnly) {
      const box = boundingBox(lat, lng, radius);
      const near = `(r.latitude BETWEEN ${p(box.minLat)} AND ${p(box.maxLat)}
                     AND r.longitude BETWEEN ${p(box.minLng)} AND ${p(box.maxLng)}
                     AND ${distance} <= ${p(radius)})`;
      const teachesOnline = me.teachingMode !== 'OFFLINE';
      where.push(teachesOnline && f.mode !== 'HOME' ? `(r.mode = 'ONLINE' OR ${near})` : near);
    }
  } else {
    if (f.city) where.push(`lower(r.city) = ${p(f.city.toLowerCase())}`);
    if (f.pincode) where.push(`r.pincode = ${p(f.pincode)}`);
  }

  const order = {
    newest: 'r.created_at DESC',
    distance: '"distanceKm" ASC NULLS LAST, r.created_at DESC',
    budget_high: 'r.monthly_budget DESC, r.created_at DESC',
  }[f.sort];

  const limitP = p(f.pageSize);
  const offsetP = p((f.page - 1) * f.pageSize);

  const { rows } = await query<Row & { _total: number }>(
    `SELECT ${PUBLIC_COLUMNS}, (${distance}) AS "distanceKm", count(*) OVER () AS _total,
            EXISTS (SELECT 1 FROM tutor_applications a WHERE a.requirement_id = r.id AND a.tutor_id = $1) AS "hasApplied",
            EXISTS (SELECT 1 FROM saved_requirements sv WHERE sv.requirement_id = r.id AND sv.tutor_id = $1) AS "isSaved"
       ${JOINS} JOIN users pu ON pu.id = r.parent_id
      WHERE ${where.join(' AND ')}
      ORDER BY ${order} LIMIT ${limitP} OFFSET ${offsetP}`,
    params,
  );
  const total = rows[0]?._total ?? 0;
  return paged(rows.map(({ _total, ...row }) => toPublic(row as Row)), total, f);
}

/** Requirement detail for a tutor: visible while open, or afterwards if the tutor applied to it. */
export async function getForTutor(id: string, tutorId: string) {
  const me = await tutorContext(tutorId);
  const params: unknown[] = [id, tutorId];
  let distance = 'NULL::double precision';
  if (me.latitude !== null && me.longitude !== null) {
    params.push(me.latitude, me.longitude);
    distance = haversineSql('r.latitude', 'r.longitude', '$3', '$4');
  }
  const { rows } = await query<Row & { applicationId: string | null; applicationStatus: string | null }>(
    `SELECT ${PUBLIC_COLUMNS}, (${distance}) AS "distanceKm",
            a.id AS "applicationId", a.status AS "applicationStatus",
            EXISTS (SELECT 1 FROM saved_requirements sv WHERE sv.requirement_id = r.id AND sv.tutor_id = $2) AS "isSaved"
       ${JOINS}
       LEFT JOIN tutor_applications a ON a.requirement_id = r.id AND a.tutor_id = $2
      WHERE r.id = $1 AND (r.status = 'OPEN' OR a.id IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM user_blocks ub WHERE ub.blocker_id = r.parent_id AND ub.blocked_id = $2)`,
    params,
  );
  if (!rows[0]) throw notFound('Requirement');
  const { applicationId, applicationStatus, ...row } = rows[0];
  return { ...toPublic(row as Row), hasApplied: applicationId !== null, applicationId, applicationStatus };
}
