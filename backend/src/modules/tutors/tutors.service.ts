import type { Db } from '../../db/pool';
import { pool, query } from '../../db/pool';
import { boundingBox, fuzz, haversineSql } from '../../utils/geo';
import { notFound } from '../../utils/errors';
import { paged, type PageQuery } from '../../utils/pagination';

/** SQL snippets that aggregate a tutor's related rows into JSON arrays. `t` is the tutor id expression. */
const agg = (t: string) => ({
  subjects: `COALESCE((SELECT json_agg(json_build_object('id', s.id, 'name', s.name) ORDER BY s.sort_order)
               FROM tutor_subjects ts JOIN subjects s ON s.id = ts.subject_id WHERE ts.tutor_id = ${t}), '[]')`,
  classes: `COALESCE((SELECT json_agg(json_build_object('id', c.id, 'name', c.name) ORDER BY c.sort_order)
               FROM tutor_classes tc JOIN classes c ON c.id = tc.class_id WHERE tc.tutor_id = ${t}), '[]')`,
  boards: `COALESCE((SELECT json_agg(json_build_object('id', b.id, 'name', b.name, 'code', b.code) ORDER BY b.sort_order)
               FROM tutor_boards tb JOIN boards b ON b.id = tb.board_id WHERE tb.tutor_id = ${t}), '[]')`,
  qualifications: `COALESCE((SELECT json_agg(json_build_object('id', q.id, 'degree', q.degree, 'institution', q.institution, 'year', q.year)
               ORDER BY q.year DESC NULLS LAST) FROM tutor_qualifications q WHERE q.tutor_id = ${t}), '[]')`,
  availability: `COALESCE((SELECT json_agg(json_build_object('id', a.id, 'dayOfWeek', a.day_of_week,
               'startTime', to_char(a.start_time, 'HH24:MI'), 'endTime', to_char(a.end_time, 'HH24:MI'))
               ORDER BY a.day_of_week, a.start_time) FROM tutor_availability a WHERE a.tutor_id = ${t}), '[]')`,
});

const FEATURED = `(tp.is_featured AND (tp.featured_until IS NULL OR tp.featured_until > now()))`;

const BASE_COLUMNS = `u.id, u.full_name AS "fullName", tp.photo_url AS "photoUrl", tp.headline, tp.bio, tp.gender,
  tp.experience_years AS "experienceYears", tp.experience_details AS "experienceDetails",
  tp.monthly_fee AS "monthlyFee", tp.teaching_mode AS "teachingMode", tp.locality, tp.city, tp.pincode,
  tp.service_radius_km AS "serviceRadiusKm", tp.is_available AS "isAvailable",
  ${FEATURED} AS "isFeatured", tp.avg_rating AS "avgRating", tp.review_count AS "reviewCount"`;

/** Full profile as seen by the tutor themself or by an admin (includes contact + verification details). */
export async function getOwnProfile(tutorId: string, db: Db = pool) {
  const a = agg('u.id');
  const { rows } = await db.query(
    `SELECT ${BASE_COLUMNS}, u.phone, u.email, u.status AS "accountStatus",
            tp.location_id AS "locationId", tp.latitude, tp.longitude,
            tp.verification_status AS "verificationStatus", tp.verification_note AS "verificationNote",
            tp.submitted_at AS "submittedAt", tp.verified_at AS "verifiedAt",
            ${a.subjects} AS subjects, ${a.classes} AS classes, ${a.boards} AS boards,
            ${a.qualifications} AS qualifications, ${a.availability} AS availability,
            COALESCE((SELECT json_agg(json_build_object('id', d.id, 'docType', d.doc_type, 'originalName', d.original_name,
                'mimeType', d.mime_type, 'sizeBytes', d.size_bytes, 'status', d.status, 'reviewNote', d.review_note,
                'uploadedAt', d.uploaded_at) ORDER BY d.uploaded_at DESC)
              FROM tutor_documents d WHERE d.tutor_id = u.id), '[]') AS documents
       FROM users u JOIN tutor_profiles tp ON tp.user_id = u.id
      WHERE u.id = $1`,
    [tutorId],
  );
  if (!rows[0]) throw notFound('Tutor profile');
  return rows[0];
}

/**
 * Profile as seen by a parent. Contact details are only included once the parent has an accepted
 * application with this tutor. Location is coarsened to ~1 km.
 */
export async function getPublicProfile(tutorId: string, viewer: { id: string; role: string }) {
  const a = agg('u.id');
  const { rows } = await query(
    `SELECT ${BASE_COLUMNS}, tp.latitude, tp.longitude, tp.verification_status AS "verificationStatus",
            u.phone, u.email,
            ${a.subjects} AS subjects, ${a.classes} AS classes, ${a.boards} AS boards,
            ${a.qualifications} AS qualifications, ${a.availability} AS availability,
            (SELECT count(*)::int FROM tutor_documents d WHERE d.tutor_id = u.id AND d.status = 'APPROVED') AS "verifiedDocuments"
       FROM users u JOIN tutor_profiles tp ON tp.user_id = u.id
      WHERE u.id = $1 AND u.status = 'ACTIVE'`,
    [tutorId],
  );
  const t = rows[0];
  if (!t || (t.verificationStatus !== 'APPROVED' && viewer.role !== 'ADMIN')) throw notFound('Tutor');

  const reviews = await query(
    `SELECT r.id, r.rating, r.comment, r.created_at AS "createdAt", split_part(u.full_name, ' ', 1) AS "parentName"
       FROM reviews r JOIN users u ON u.id = r.parent_id
      WHERE r.tutor_id = $1 AND r.status = 'VISIBLE' ORDER BY r.created_at DESC LIMIT 10`,
    [tutorId],
  );

  let connection: { applicationId: string; status: string; initiatedBy: string } | null = null;
  if (viewer.role === 'PARENT') {
    const app = await query<{ id: string; status: string; initiated_by: string }>(
      `SELECT id, status, initiated_by FROM tutor_applications
        WHERE tutor_id = $1 AND parent_id = $2 AND status IN ('PENDING', 'ACCEPTED')
        ORDER BY (status = 'ACCEPTED') DESC, created_at DESC LIMIT 1`,
      [tutorId, viewer.id],
    );
    if (app.rows[0]) {
      connection = { applicationId: app.rows[0].id, status: app.rows[0].status, initiatedBy: app.rows[0].initiated_by };
    }
  }
  const contactVisible = viewer.role === 'ADMIN' || connection?.status === 'ACCEPTED';

  const { phone, email, latitude, longitude, ...rest } = t;
  return {
    ...rest,
    approxLatitude: fuzz(latitude),
    approxLongitude: fuzz(longitude),
    contact: contactVisible ? { phone, email } : null,
    connection,
    reviews: reviews.rows,
  };
}

export interface TutorSearch extends PageQuery {
  classId?: number;
  subjectId?: number;
  boardId?: number;
  lat?: number;
  lng?: number;
  radiusKm: number;
  city?: string;
  pincode?: string;
  mode?: 'ONLINE' | 'OFFLINE';
  minFee?: number;
  maxFee?: number;
  minExperience?: number;
  gender?: 'MALE' | 'FEMALE';
  dayOfWeek?: number;
  timeFrom?: string;
  timeTo?: string;
  q?: string;
  sort: 'relevance' | 'distance' | 'rating' | 'fee_low' | 'fee_high' | 'experience';
}

/** Parent-facing tutor discovery. Only approved, available, active tutors are ever returned. */
export async function searchTutors(f: TutorSearch) {
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const where = [`tp.verification_status = 'APPROVED'`, 'tp.is_available', `u.status = 'ACTIVE'`];

  if (f.classId) where.push(`EXISTS (SELECT 1 FROM tutor_classes x WHERE x.tutor_id = u.id AND x.class_id = ${p(f.classId)})`);
  if (f.subjectId) where.push(`EXISTS (SELECT 1 FROM tutor_subjects x WHERE x.tutor_id = u.id AND x.subject_id = ${p(f.subjectId)})`);
  if (f.boardId) where.push(`EXISTS (SELECT 1 FROM tutor_boards x WHERE x.tutor_id = u.id AND x.board_id = ${p(f.boardId)})`);
  if (f.mode === 'ONLINE') where.push(`tp.teaching_mode IN ('ONLINE', 'BOTH')`);
  if (f.mode === 'OFFLINE') where.push(`tp.teaching_mode IN ('OFFLINE', 'BOTH')`);
  if (f.minFee !== undefined) where.push(`tp.monthly_fee >= ${p(f.minFee)}`);
  if (f.maxFee !== undefined) where.push(`tp.monthly_fee <= ${p(f.maxFee)}`);
  if (f.minExperience !== undefined) where.push(`tp.experience_years >= ${p(f.minExperience)}`);
  if (f.gender) where.push(`tp.gender = ${p(f.gender)}`);
  if (f.q) where.push(`(lower(u.full_name) LIKE ${p(`%${f.q.toLowerCase()}%`)} OR lower(tp.headline) LIKE $${params.length})`);
  if (f.dayOfWeek !== undefined || f.timeFrom || f.timeTo) {
    const conds = ['a.tutor_id = u.id'];
    if (f.dayOfWeek !== undefined) conds.push(`a.day_of_week = ${p(f.dayOfWeek)}`);
    if (f.timeFrom) conds.push(`a.start_time <= ${p(f.timeFrom)}::time`);
    if (f.timeTo) conds.push(`a.end_time >= ${p(f.timeTo)}::time`);
    where.push(`EXISTS (SELECT 1 FROM tutor_availability a WHERE ${conds.join(' AND ')})`);
  }

  let distance = 'NULL::double precision';
  const hasPoint = f.lat !== undefined && f.lng !== undefined;
  if (hasPoint) {
    distance = haversineSql('tp.latitude', 'tp.longitude', `${p(f.lat)}::float8`, `${p(f.lng)}::float8`);
    if (f.mode !== 'ONLINE') {
      // Index-friendly bounding box first, then exact distance. For home tuition the tutor must also
      // be willing to travel that far (their own service radius).
      const box = boundingBox(f.lat!, f.lng!, f.radiusKm);
      where.push(`tp.latitude BETWEEN ${p(box.minLat)} AND ${p(box.maxLat)}`);
      where.push(`tp.longitude BETWEEN ${p(box.minLng)} AND ${p(box.maxLng)}`);
      where.push(`${distance} <= ${p(f.radiusKm)}`);
      if (f.mode === 'OFFLINE') where.push(`${distance} <= tp.service_radius_km`);
    }
  } else {
    if (f.city) where.push(`lower(tp.city) = ${p(f.city.toLowerCase())}`);
    if (f.pincode) where.push(`tp.pincode = ${p(f.pincode)}`);
  }

  const order: Record<TutorSearch['sort'], string> = {
    relevance: hasPoint ? '"avgRating" DESC, "distanceKm" ASC NULLS LAST' : '"avgRating" DESC, "reviewCount" DESC',
    distance: '"distanceKm" ASC NULLS LAST',
    rating: '"avgRating" DESC, "reviewCount" DESC',
    fee_low: '"monthlyFee" ASC NULLS LAST',
    fee_high: '"monthlyFee" DESC NULLS LAST',
    experience: '"experienceYears" DESC',
  };

  const a = agg('u.id');
  const limitP = p(f.pageSize);
  const offsetP = p((f.page - 1) * f.pageSize);

  const { rows } = await query<Record<string, unknown> & { _total: number }>(
    `SELECT u.id, u.full_name AS "fullName", tp.photo_url AS "photoUrl", tp.headline, tp.gender,
            tp.experience_years AS "experienceYears", tp.monthly_fee AS "monthlyFee",
            tp.teaching_mode AS "teachingMode", tp.locality, tp.city,
            tp.avg_rating AS "avgRating", tp.review_count AS "reviewCount", ${FEATURED} AS "isFeatured",
            round((${distance})::numeric, 1)::float AS "distanceKm",
            ${a.subjects} AS subjects, ${a.classes} AS classes,
            count(*) OVER () AS _total
       FROM users u JOIN tutor_profiles tp ON tp.user_id = u.id
      WHERE ${where.join(' AND ')}
      ORDER BY "isFeatured" DESC, ${order[f.sort]}, u.id
      LIMIT ${limitP} OFFSET ${offsetP}`,
    params,
  );
  const total = rows[0]?._total ?? 0;
  return paged(rows.map(({ _total, ...row }) => row), total, f);
}

export interface Completeness {
  complete: boolean;
  missing: string[];
}

/** Lists what still has to be filled in before a tutor may submit their profile for verification. */
export async function checkCompleteness(tutorId: string): Promise<Completeness> {
  const p = await getOwnProfile(tutorId);
  const missing: string[] = [];
  if (!p.photoUrl) missing.push('Profile photograph');
  if (!p.gender) missing.push('Gender');
  if (!p.monthlyFee) missing.push('Monthly tuition fee');
  if (!p.city || !p.pincode || p.latitude === null || p.longitude === null) missing.push('Teaching location');
  if (!p.subjects.length) missing.push('Subjects you teach');
  if (!p.classes.length) missing.push('Classes you teach');
  if (!p.boards.length) missing.push('Education boards');
  if (!p.qualifications.length) missing.push('At least one qualification');
  if (!p.availability.length) missing.push('Available days and time slots');
  if (!p.documents.some((d: { docType: string }) => d.docType === 'QUALIFICATION')) {
    missing.push('Qualification certificate upload');
  }
  return { complete: missing.length === 0, missing };
}
