/**
 * Loads demo data: 1 admin, 3 parents (with children and requirements) and 14 tutors across cities.
 * Safe to re-run: removes previous demo accounts (phones +9190000xxxxx) first.
 *
 * Demo logins (OTP is returned in the API response while OTP_DEV_MODE=true):
 *   Admin   9000000001
 *   Parents 9000000101, 9000000102, 9000000103
 *   Tutors  9000000201 ... 9000000214
 */
import 'dotenv/config';
import { Client } from 'pg';

const db = new Client({ connectionString: process.env.DATABASE_URL });

const id = async (table: string, name: string, col = 'name') =>
  (await db.query(`SELECT id FROM ${table} WHERE ${col} = $1`, [name])).rows[0]?.id as number;
const ids = async (table: string, names: string[], col = 'name') =>
  (await db.query(`SELECT id FROM ${table} WHERE ${col} = ANY($1)`, [names])).rows.map((r) => r.id as number);

interface DemoTutor {
  name: string;
  gender: 'MALE' | 'FEMALE';
  locality: string;
  headline: string;
  exp: number;
  fee: number;
  mode: 'ONLINE' | 'OFFLINE' | 'BOTH';
  subjects: string[];
  classes: string[];
  boards: string[];
  degree: string;
  rating: number;
  reviews: number;
  status?: 'APPROVED' | 'PENDING';
  featured?: boolean;
}

const CLASS_RANGE = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `Class ${from + i}`);

const TUTORS: DemoTutor[] = [
  { name: 'Ananya Rao', gender: 'FEMALE', locality: 'Indiranagar', headline: 'Maths & Science made simple for middle school', exp: 8, fee: 4500, mode: 'BOTH', subjects: ['Mathematics', 'Science'], classes: CLASS_RANGE(6, 10), boards: ['CBSE', 'ICSE'], degree: 'M.Sc. Mathematics', rating: 4.8, reviews: 23, featured: true },
  { name: 'Rahul Menon', gender: 'MALE', locality: 'Koramangala', headline: 'IIT alumnus - Physics & Maths for boards and JEE', exp: 12, fee: 9000, mode: 'BOTH', subjects: ['Physics', 'Mathematics'], classes: CLASS_RANGE(9, 12), boards: ['CBSE', 'STATE'], degree: 'B.Tech, IIT Madras', rating: 4.9, reviews: 41 },
  { name: 'Priya Sharma', gender: 'FEMALE', locality: 'Jayanagar', headline: 'Patient primary teacher - phonics, English & EVS', exp: 6, fee: 3000, mode: 'OFFLINE', subjects: ['English', 'EVS', 'Phonics & Handwriting', 'All Subjects'], classes: ['Nursery', 'LKG', 'UKG', ...CLASS_RANGE(1, 4)], boards: ['CBSE', 'ICSE', 'STATE'], degree: 'B.Ed., Bangalore University', rating: 4.7, reviews: 18 },
  { name: 'Karthik Iyer', gender: 'MALE', locality: 'HSR Layout', headline: 'Chemistry & Biology for NEET aspirants', exp: 9, fee: 7000, mode: 'ONLINE', subjects: ['Chemistry', 'Biology'], classes: CLASS_RANGE(11, 12), boards: ['CBSE', 'STATE'], degree: 'M.Sc. Chemistry', rating: 4.6, reviews: 15 },
  { name: 'Fatima Sheikh', gender: 'FEMALE', locality: 'Whitefield', headline: 'Commerce specialist - Accounts, Economics, BST', exp: 10, fee: 6000, mode: 'BOTH', subjects: ['Accountancy', 'Economics', 'Business Studies'], classes: CLASS_RANGE(11, 12), boards: ['CBSE', 'ICSE'], degree: 'M.Com, CA Inter', rating: 4.5, reviews: 12 },
  { name: 'Vikram Singh', gender: 'MALE', locality: 'Indiranagar', headline: 'Computer Science & Python for school students', exp: 4, fee: 4000, mode: 'BOTH', subjects: ['Computer Science', 'Mathematics'], classes: CLASS_RANGE(6, 12), boards: ['CBSE', 'ICSE', 'IGCSE'], degree: 'B.E. Computer Science', rating: 4.4, reviews: 7 },
  { name: 'Meera Pillai', gender: 'FEMALE', locality: 'Koramangala', headline: 'Hindi & Sanskrit with a love for literature', exp: 15, fee: 3500, mode: 'OFFLINE', subjects: ['Hindi', 'Sanskrit'], classes: CLASS_RANGE(1, 10), boards: ['CBSE', 'STATE'], degree: 'M.A. Hindi', rating: 4.8, reviews: 30 },
  { name: 'Arjun Nair', gender: 'MALE', locality: 'Andheri West', headline: 'All subjects for classes 1-8 at your home', exp: 5, fee: 3500, mode: 'OFFLINE', subjects: ['All Subjects', 'Mathematics', 'English', 'Science'], classes: CLASS_RANGE(1, 8), boards: ['CBSE', 'ICSE', 'STATE'], degree: 'B.Sc., B.Ed.', rating: 4.3, reviews: 9 },
  { name: 'Sneha Kulkarni', gender: 'FEMALE', locality: 'Powai', headline: 'ICSE/IGCSE Maths and Physics', exp: 7, fee: 6500, mode: 'BOTH', subjects: ['Mathematics', 'Physics'], classes: CLASS_RANGE(8, 12), boards: ['ICSE', 'IGCSE', 'IB'], degree: 'M.Sc. Physics', rating: 4.7, reviews: 20, featured: true },
  { name: 'Rohit Gupta', gender: 'MALE', locality: 'Dwarka', headline: 'Social Studies, History & Political Science', exp: 11, fee: 4000, mode: 'BOTH', subjects: ['Social Studies', 'History', 'Political Science', 'Geography'], classes: CLASS_RANGE(6, 12), boards: ['CBSE'], degree: 'M.A. History', rating: 4.5, reviews: 14 },
  { name: 'Neha Verma', gender: 'FEMALE', locality: 'Lajpat Nagar', headline: 'Spoken & written English, French for beginners', exp: 6, fee: 5000, mode: 'ONLINE', subjects: ['English', 'French'], classes: CLASS_RANGE(3, 12), boards: ['CBSE', 'ICSE', 'IB'], degree: 'M.A. English, DELF B2', rating: 4.6, reviews: 11 },
  { name: 'Suresh Reddy', gender: 'MALE', locality: 'Madhapur', headline: 'Maths for State Board and CBSE, 20 years experience', exp: 20, fee: 5500, mode: 'OFFLINE', subjects: ['Mathematics'], classes: CLASS_RANGE(6, 12), boards: ['STATE', 'CBSE'], degree: 'M.Sc., M.Phil. Mathematics', rating: 4.9, reviews: 52 },
  { name: 'Divya Krishnan', gender: 'FEMALE', locality: 'Anna Nagar', headline: 'Biology and Science with diagrams and models', exp: 3, fee: 3000, mode: 'BOTH', subjects: ['Biology', 'Science'], classes: CLASS_RANGE(6, 12), boards: ['STATE', 'CBSE'], degree: 'M.Sc. Zoology', rating: 0, reviews: 0, status: 'PENDING' },
  { name: 'Aman Joshi', gender: 'MALE', locality: 'Kothrud', headline: 'Economics & Maths for Class 11-12', exp: 2, fee: 4000, mode: 'BOTH', subjects: ['Economics', 'Mathematics'], classes: CLASS_RANGE(11, 12), boards: ['CBSE', 'STATE'], degree: 'M.A. Economics', rating: 0, reviews: 0, status: 'PENDING' },
];

async function main() {
  await db.connect();
  await db.query('BEGIN');
  try {
    await db.query(`DELETE FROM users WHERE phone LIKE '+9190000%'`);

    const admin = await db.query(
      `INSERT INTO users (role, full_name, phone, email, phone_verified) VALUES ('ADMIN', 'Demo Admin', '+919000000001', 'admin@smarttuition.demo', true) RETURNING id`,
    );
    const adminId = admin.rows[0].id;

    // ---------- Tutors ----------
    let n = 1;
    for (const t of TUTORS) {
      const phone = `+9190000002${String(n).padStart(2, '0')}`;
      const loc = (await db.query('SELECT * FROM locations WHERE locality = $1', [t.locality])).rows[0];
      const u = await db.query(
        `INSERT INTO users (role, full_name, phone, email, phone_verified) VALUES ('TUTOR', $1, $2, $3, true) RETURNING id`,
        [t.name, phone, `${t.name.toLowerCase().replace(/\s+/g, '.')}@smarttuition.demo`],
      );
      const uid = u.rows[0].id;
      const status = t.status ?? 'APPROVED';
      await db.query(
        `INSERT INTO tutor_profiles (user_id, headline, bio, gender, experience_years, experience_details, monthly_fee, teaching_mode,
           location_id, locality, city, pincode, latitude, longitude, service_radius_km, verification_status, submitted_at,
           verified_at, verified_by, is_featured, featured_until, avg_rating, review_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::verification_status, now() - interval '10 days',
           CASE WHEN $16::verification_status = 'APPROVED' THEN now() - interval '7 days' END, CASE WHEN $16::verification_status = 'APPROVED' THEN $17::uuid END,
           $18, CASE WHEN $18 THEN now() + interval '30 days' END, $19, $20)`,
        [uid, t.headline, `Hi, I am ${t.name.split(' ')[0]}. ${t.headline}. I focus on concepts, regular practice and weekly progress updates for parents.`,
          t.gender, t.exp, `${t.exp} years of home and online tutoring.`, t.fee, t.mode, loc.id, loc.locality, loc.city, loc.pincode,
          loc.latitude + (n % 3) * 0.004, loc.longitude - (n % 2) * 0.004, 8, status, adminId, !!t.featured, t.rating, t.reviews],
      );
      await db.query('INSERT INTO tutor_subjects SELECT $1, unnest($2::int[])', [uid, await ids('subjects', t.subjects)]);
      await db.query('INSERT INTO tutor_classes SELECT $1, unnest($2::int[])', [uid, await ids('classes', t.classes)]);
      await db.query('INSERT INTO tutor_boards SELECT $1, unnest($2::int[])', [uid, await ids('boards', t.boards, 'code')]);
      await db.query('INSERT INTO tutor_qualifications (tutor_id, degree, institution, year) VALUES ($1, $2, $3, $4)', [
        uid, t.degree, 'Demo University', 2024 - t.exp - 1,
      ]);
      for (const day of [1, 2, 3, 4, 5]) {
        await db.query(`INSERT INTO tutor_availability (tutor_id, day_of_week, start_time, end_time) VALUES ($1, $2, '16:00', '20:00')`, [uid, day]);
      }
      await db.query(`INSERT INTO tutor_availability (tutor_id, day_of_week, start_time, end_time) VALUES ($1, 6, '09:00', '13:00')`, [uid]);
      n++;
    }

    // ---------- Parents, children, requirements ----------
    const parents = [
      { name: 'Sunita Agarwal', phone: '+919000000101', locality: 'Indiranagar', kids: [{ name: 'Aarav', cls: 'Class 8', board: 'CBSE', gender: 'MALE' }, { name: 'Diya', cls: 'UKG', board: 'CBSE', gender: 'FEMALE' }] },
      { name: 'Rajesh Patil', phone: '+919000000102', locality: 'Powai', kids: [{ name: 'Ishaan', cls: 'Class 11', board: 'ICSE', gender: 'MALE' }] },
      { name: 'Lakshmi Narayan', phone: '+919000000103', locality: 'Koramangala', kids: [{ name: 'Kavya', cls: 'Class 10', board: 'STATE', gender: 'FEMALE' }] },
    ];
    const requirements: Record<string, { subjects: string[]; days: number; time: string; gender: string; budget: number; mode: string; notes: string }> = {
      Aarav: { subjects: ['Mathematics', 'Science'], days: 5, time: 'Evening 5-7 PM', gender: 'ANY', budget: 5000, mode: 'HOME', notes: 'Needs help with algebra and weekly tests.' },
      Diya: { subjects: ['Phonics & Handwriting', 'English'], days: 3, time: 'Afternoon 3-4 PM', gender: 'FEMALE', budget: 3000, mode: 'HOME', notes: 'Looking for a gentle teacher for reading readiness.' },
      Ishaan: { subjects: ['Physics', 'Mathematics'], days: 4, time: 'Evening 6-8 PM', gender: 'ANY', budget: 8000, mode: 'EITHER', notes: 'Board exam preparation, also interested in JEE foundation.' },
      Kavya: { subjects: ['Mathematics'], days: 3, time: 'Weekends morning', gender: 'ANY', budget: 4000, mode: 'ONLINE', notes: 'Wants to improve speed and accuracy before boards.' },
    };
    for (const p of parents) {
      const loc = (await db.query('SELECT * FROM locations WHERE locality = $1', [p.locality])).rows[0];
      const u = await db.query(
        `INSERT INTO users (role, full_name, phone, email, phone_verified) VALUES ('PARENT', $1, $2, $3, true) RETURNING id`,
        [p.name, p.phone, `${p.name.toLowerCase().replace(/\s+/g, '.')}@smarttuition.demo`],
      );
      const pid = u.rows[0].id;
      await db.query(
        `INSERT INTO parent_profiles (user_id, address_line, location_id, city, pincode, latitude, longitude) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [pid, `Flat 12, Demo Residency, ${loc.locality}`, loc.id, loc.city, loc.pincode, loc.latitude + 0.002, loc.longitude + 0.002],
      );
      for (const k of p.kids) {
        const s = await db.query(
          `INSERT INTO students (parent_id, name, class_id, board_id, school_name, gender) VALUES ($1, $2, $3, $4, 'Demo Public School', $5) RETURNING id`,
          [pid, k.name, await id('classes', k.cls), await id('boards', k.board, 'code'), k.gender],
        );
        const r = requirements[k.name];
        const req = await db.query(
          `INSERT INTO tuition_requirements (parent_id, student_id, class_id, board_id, days_per_week, preferred_time, preferred_tutor_gender,
             monthly_budget, mode, location_id, locality, city, pincode, latitude, longitude, additional_notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
          [pid, s.rows[0].id, await id('classes', k.cls), await id('boards', k.board, 'code'), r.days, r.time, r.gender, r.budget, r.mode,
            loc.id, loc.locality, loc.city, loc.pincode, loc.latitude + 0.002, loc.longitude + 0.002, r.notes],
        );
        await db.query('INSERT INTO requirement_subjects SELECT $1, unnest($2::int[])', [req.rows[0].id, await ids('subjects', r.subjects)]);
      }
    }

    await db.query('COMMIT');
    console.log(`Seeded demo data: 1 admin, ${TUTORS.length} tutors, ${parents.length} parents.`);
    console.log('Admin login: 9000000001 | Parent: 9000000101 | Tutor: 9000000201');
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
