-- =====================================================================
-- Smart Tuition - initial schema
-- PostgreSQL 13+ (uses gen_random_uuid() from core)
-- =====================================================================

-- ---------- Enumerated types ----------
CREATE TYPE user_role            AS ENUM ('PARENT', 'TUTOR', 'ADMIN');
CREATE TYPE user_status          AS ENUM ('ACTIVE', 'BLOCKED', 'DELETED');
CREATE TYPE gender               AS ENUM ('MALE', 'FEMALE', 'OTHER');
CREATE TYPE gender_preference    AS ENUM ('ANY', 'MALE', 'FEMALE');
CREATE TYPE teaching_mode        AS ENUM ('ONLINE', 'OFFLINE', 'BOTH');
CREATE TYPE requirement_mode     AS ENUM ('ONLINE', 'HOME', 'EITHER');
CREATE TYPE verification_status  AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE document_type        AS ENUM ('QUALIFICATION', 'EXPERIENCE', 'ID_PROOF', 'OTHER');
CREATE TYPE document_status      AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE requirement_status   AS ENUM ('OPEN', 'FULFILLED', 'CLOSED');
CREATE TYPE application_status   AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');
CREATE TYPE application_initiator AS ENUM ('TUTOR', 'PARENT');
CREATE TYPE booking_status       AS ENUM ('DEMO_PENDING', 'DEMO_SCHEDULED', 'DEMO_COMPLETED', 'CONFIRMED', 'COMPLETED', 'CANCELLED');
CREATE TYPE review_status        AS ENUM ('VISIBLE', 'HIDDEN');
CREATE TYPE payment_purpose      AS ENUM ('SUBSCRIPTION', 'FEATURED_LISTING', 'BOOKING_FEE');
CREATE TYPE payment_status       AS ENUM ('CREATED', 'PAID', 'FAILED', 'REFUNDED');
CREATE TYPE subscription_status  AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'CANCELLED');
CREATE TYPE complaint_status     AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED');
CREATE TYPE announcement_audience AS ENUM ('ALL', 'PARENTS', 'TUTORS');

-- ---------- Helper: auto-update updated_at ----------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 1. Users
-- =====================================================================
CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role            user_role    NOT NULL,
  full_name       varchar(120) NOT NULL,
  phone           varchar(15)  NOT NULL,          -- E.164, e.g. +919876543210
  email           varchar(254),
  phone_verified  boolean      NOT NULL DEFAULT false,
  status          user_status  NOT NULL DEFAULT 'ACTIVE',
  blocked_reason  text,
  fcm_token       text,
  last_login_at   timestamptz,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_users_phone ON users (phone);
CREATE UNIQUE INDEX ux_users_email ON users (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX ix_users_role_status ON users (role, status);
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- OTP challenges (codes are stored hashed only)
CREATE TABLE otp_codes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone        varchar(15) NOT NULL,
  code_hash    char(64)    NOT NULL,
  attempts     smallint    NOT NULL DEFAULT 0,
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_otp_phone_created ON otp_codes (phone, created_at DESC);

-- Refresh tokens (rotated on every use; stored hashed)
CREATE TABLE refresh_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   char(64)    NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_refresh_user ON refresh_tokens (user_id);

-- =====================================================================
-- Master data: 5. Subjects, 6. Classes, 7. Boards, 19. Locations
-- =====================================================================
CREATE TABLE subjects (
  id          serial PRIMARY KEY,
  name        varchar(80) NOT NULL UNIQUE,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  int         NOT NULL DEFAULT 0
);

CREATE TABLE classes (
  id          serial PRIMARY KEY,
  name        varchar(40) NOT NULL UNIQUE,
  sort_order  int         NOT NULL,
  is_active   boolean     NOT NULL DEFAULT true
);

CREATE TABLE boards (
  id          serial PRIMARY KEY,
  name        varchar(80) NOT NULL UNIQUE,
  code        varchar(20) NOT NULL UNIQUE,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  int         NOT NULL DEFAULT 0
);

CREATE TABLE locations (
  id          serial PRIMARY KEY,
  locality    varchar(120) NOT NULL,
  city        varchar(80)  NOT NULL,
  state       varchar(80)  NOT NULL,
  pincode     char(6)      NOT NULL,
  latitude    double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude   double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  is_active   boolean      NOT NULL DEFAULT true,
  UNIQUE (pincode, locality)
);
CREATE INDEX ix_locations_city ON locations (lower(city));
CREATE INDEX ix_locations_pincode ON locations (pincode);

-- =====================================================================
-- 2. ParentProfiles  /  4. Students
-- =====================================================================
CREATE TABLE parent_profiles (
  user_id       uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  address_line  varchar(255),                 -- PRIVATE: never exposed publicly
  location_id   int REFERENCES locations(id),
  city          varchar(80),
  pincode       char(6),
  latitude      double precision,             -- PRIVATE
  longitude     double precision,             -- PRIVATE
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_parent_profiles_updated BEFORE UPDATE ON parent_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE students (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         varchar(120) NOT NULL,
  class_id     int  NOT NULL REFERENCES classes(id),
  board_id     int  REFERENCES boards(id),
  school_name  varchar(160),
  gender       gender,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_students_parent ON students (parent_id);
CREATE TRIGGER trg_students_updated BEFORE UPDATE ON students FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- 3. TutorProfiles (+ qualifications, classes, boards)
-- =====================================================================
CREATE TABLE tutor_profiles (
  user_id              uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  photo_url            text,
  headline             varchar(160),
  bio                  text,
  gender               gender,
  experience_years     smallint NOT NULL DEFAULT 0 CHECK (experience_years BETWEEN 0 and 60),
  experience_details   text,
  monthly_fee          int      CHECK (monthly_fee >= 0),           -- INR per month (typical)
  teaching_mode        teaching_mode NOT NULL DEFAULT 'OFFLINE',
  location_id          int REFERENCES locations(id),
  locality             varchar(120),
  city                 varchar(80),
  pincode              char(6),
  latitude             double precision,
  longitude            double precision,
  service_radius_km    smallint NOT NULL DEFAULT 5 CHECK (service_radius_km BETWEEN 1 AND 100),
  is_available         boolean  NOT NULL DEFAULT true,
  verification_status  verification_status NOT NULL DEFAULT 'DRAFT',
  verification_note    text,
  submitted_at         timestamptz,
  verified_at          timestamptz,
  verified_by          uuid REFERENCES users(id),
  is_featured          boolean  NOT NULL DEFAULT false,
  featured_until       timestamptz,
  avg_rating           numeric(3,2) NOT NULL DEFAULT 0,
  review_count         int      NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
-- Public search only ever touches approved + available tutors
CREATE INDEX ix_tutor_search ON tutor_profiles (verification_status, is_available, monthly_fee);
CREATE INDEX ix_tutor_geo ON tutor_profiles (latitude, longitude) WHERE verification_status = 'APPROVED';
CREATE INDEX ix_tutor_city ON tutor_profiles (lower(city));
CREATE INDEX ix_tutor_pincode ON tutor_profiles (pincode);
CREATE TRIGGER trg_tutor_profiles_updated BEFORE UPDATE ON tutor_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE tutor_qualifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id     uuid NOT NULL REFERENCES tutor_profiles(user_id) ON DELETE CASCADE,
  degree       varchar(120) NOT NULL,
  institution  varchar(160),
  year         smallint CHECK (year BETWEEN 1950 AND 2100),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_tutor_qual_tutor ON tutor_qualifications (tutor_id);

-- 8. TutorSubjects
CREATE TABLE tutor_subjects (
  tutor_id    uuid NOT NULL REFERENCES tutor_profiles(user_id) ON DELETE CASCADE,
  subject_id  int  NOT NULL REFERENCES subjects(id),
  PRIMARY KEY (tutor_id, subject_id)
);
CREATE INDEX ix_tutor_subjects_subject ON tutor_subjects (subject_id);

CREATE TABLE tutor_classes (
  tutor_id   uuid NOT NULL REFERENCES tutor_profiles(user_id) ON DELETE CASCADE,
  class_id   int  NOT NULL REFERENCES classes(id),
  PRIMARY KEY (tutor_id, class_id)
);
CREATE INDEX ix_tutor_classes_class ON tutor_classes (class_id);

CREATE TABLE tutor_boards (
  tutor_id   uuid NOT NULL REFERENCES tutor_profiles(user_id) ON DELETE CASCADE,
  board_id   int  NOT NULL REFERENCES boards(id),
  PRIMARY KEY (tutor_id, board_id)
);
CREATE INDEX ix_tutor_boards_board ON tutor_boards (board_id);

-- 9. TutorAvailability (weekly recurring slots; day_of_week 0 = Sunday)
CREATE TABLE tutor_availability (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id     uuid     NOT NULL REFERENCES tutor_profiles(user_id) ON DELETE CASCADE,
  day_of_week  smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time   time     NOT NULL,
  end_time     time     NOT NULL,
  CHECK (start_time < end_time)
);
CREATE INDEX ix_tutor_availability ON tutor_availability (tutor_id, day_of_week);

-- 18. TutorDocuments
CREATE TABLE tutor_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id       uuid NOT NULL REFERENCES tutor_profiles(user_id) ON DELETE CASCADE,
  doc_type       document_type   NOT NULL,
  storage_key    text            NOT NULL,     -- never a public URL
  original_name  varchar(255)    NOT NULL,
  mime_type      varchar(100)    NOT NULL,
  size_bytes     int             NOT NULL,
  status         document_status NOT NULL DEFAULT 'PENDING',
  review_note    text,
  reviewed_by    uuid REFERENCES users(id),
  reviewed_at    timestamptz,
  uploaded_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_tutor_documents_tutor ON tutor_documents (tutor_id);

-- =====================================================================
-- 10. TuitionRequirements
-- =====================================================================
CREATE TABLE tuition_requirements (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id              uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id                int  NOT NULL REFERENCES classes(id),
  board_id                int  REFERENCES boards(id),
  days_per_week           smallint NOT NULL CHECK (days_per_week BETWEEN 1 AND 7),
  preferred_time          varchar(60) NOT NULL,          -- e.g. "Evening 5-7 PM"
  preferred_tutor_gender  gender_preference NOT NULL DEFAULT 'ANY',
  monthly_budget          int NOT NULL CHECK (monthly_budget > 0),
  mode                    requirement_mode  NOT NULL,
  location_id             int REFERENCES locations(id),
  locality                varchar(120),
  city                    varchar(80) NOT NULL,
  pincode                 char(6) NOT NULL,
  latitude                double precision,            -- PRIVATE exact point
  longitude               double precision,            -- PRIVATE exact point
  additional_notes        text,
  status                  requirement_status NOT NULL DEFAULT 'OPEN',
  fulfilled_by            uuid REFERENCES users(id),
  fulfilled_at            timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_req_parent ON tuition_requirements (parent_id, created_at DESC);
CREATE INDEX ix_req_open ON tuition_requirements (status, class_id, monthly_budget) WHERE status = 'OPEN';
CREATE INDEX ix_req_geo ON tuition_requirements (latitude, longitude) WHERE status = 'OPEN';
CREATE INDEX ix_req_city ON tuition_requirements (lower(city));
CREATE INDEX ix_req_pincode ON tuition_requirements (pincode);
CREATE TRIGGER trg_req_updated BEFORE UPDATE ON tuition_requirements FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE requirement_subjects (
  requirement_id  uuid NOT NULL REFERENCES tuition_requirements(id) ON DELETE CASCADE,
  subject_id      int  NOT NULL REFERENCES subjects(id),
  PRIMARY KEY (requirement_id, subject_id)
);
CREATE INDEX ix_req_subjects_subject ON requirement_subjects (subject_id);

CREATE TABLE saved_requirements (
  tutor_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requirement_id  uuid NOT NULL REFERENCES tuition_requirements(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tutor_id, requirement_id)
);

-- =====================================================================
-- 11. TutorApplications (tutor -> requirement, or parent -> tutor request)
-- =====================================================================
CREATE TABLE tutor_applications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id  uuid REFERENCES tuition_requirements(id) ON DELETE CASCADE,
  tutor_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id      uuid REFERENCES students(id) ON DELETE SET NULL,
  initiated_by    application_initiator NOT NULL,
  status          application_status    NOT NULL DEFAULT 'PENDING',
  message         text,
  proposed_fee    int CHECK (proposed_fee >= 0),
  responded_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
-- Duplicate-application protection
CREATE UNIQUE INDEX ux_app_requirement_tutor ON tutor_applications (requirement_id, tutor_id)
  WHERE requirement_id IS NOT NULL;
CREATE UNIQUE INDEX ux_app_direct_pending ON tutor_applications (parent_id, tutor_id)
  WHERE requirement_id IS NULL AND status = 'PENDING';
CREATE INDEX ix_app_tutor ON tutor_applications (tutor_id, status, created_at DESC);
CREATE INDEX ix_app_parent ON tutor_applications (parent_id, status, created_at DESC);
CREATE TRIGGER trg_app_updated BEFORE UPDATE ON tutor_applications FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- 12. Bookings
-- =====================================================================
CREATE TABLE bookings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id   uuid NOT NULL UNIQUE REFERENCES tutor_applications(id) ON DELETE CASCADE,
  parent_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tutor_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id       uuid REFERENCES students(id) ON DELETE SET NULL,
  requirement_id   uuid REFERENCES tuition_requirements(id) ON DELETE SET NULL,
  status           booking_status NOT NULL DEFAULT 'DEMO_PENDING',
  demo_at          timestamptz,
  start_date       date,
  monthly_fee      int CHECK (monthly_fee >= 0),
  schedule_notes   text,
  confirmed_at     timestamptz,
  cancelled_at     timestamptz,
  cancel_reason    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_bookings_parent ON bookings (parent_id, status);
CREATE INDEX ix_bookings_tutor ON bookings (tutor_id, status);
CREATE INDEX ix_bookings_demo ON bookings (demo_at) WHERE status = 'DEMO_SCHEDULED';
CREATE TRIGGER trg_bookings_updated BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- 13. Messages (grouped in conversations, opened only after acceptance)
-- =====================================================================
CREATE TABLE conversations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id   uuid NOT NULL UNIQUE REFERENCES tutor_applications(id) ON DELETE CASCADE,
  parent_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tutor_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_message_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_conv_parent ON conversations (parent_id, last_message_at DESC);
CREATE INDEX ix_conv_tutor ON conversations (tutor_id, last_message_at DESC);

CREATE TABLE messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body             text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  read_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_messages_conv ON messages (conversation_id, created_at DESC);

-- =====================================================================
-- 14. Notifications
-- =====================================================================
CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        varchar(50)  NOT NULL,        -- APPLICATION_RECEIVED, APPLICATION_ACCEPTED, ...
  title       varchar(160) NOT NULL,
  body        text         NOT NULL,
  data        jsonb        NOT NULL DEFAULT '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX ix_notifications_user ON notifications (user_id, created_at DESC);
CREATE INDEX ix_notifications_unread ON notifications (user_id) WHERE read_at IS NULL;

CREATE TABLE announcements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       varchar(160) NOT NULL,
  body        text NOT NULL,
  audience    announcement_audience NOT NULL DEFAULT 'ALL',
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- 15. Reviews
-- =====================================================================
CREATE TABLE reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  parent_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tutor_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating      smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     text,
  status      review_status NOT NULL DEFAULT 'VISIBLE',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, parent_id)
);
CREATE INDEX ix_reviews_tutor ON reviews (tutor_id, created_at DESC);

-- =====================================================================
-- 17. Subscriptions (+ plans)  /  16. Payments
-- =====================================================================
CREATE TABLE subscription_plans (
  id             serial PRIMARY KEY,
  code           varchar(40)  NOT NULL UNIQUE,
  name           varchar(80)  NOT NULL,
  description    text,
  price_paise    int          NOT NULL CHECK (price_paise >= 0),
  duration_days  int          NOT NULL CHECK (duration_days > 0),
  features       jsonb        NOT NULL DEFAULT '[]'::jsonb,
  is_active      boolean      NOT NULL DEFAULT true
);

CREATE TABLE payments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  purpose               payment_purpose NOT NULL,
  amount_paise          int  NOT NULL CHECK (amount_paise > 0),
  currency              char(3) NOT NULL DEFAULT 'INR',
  status                payment_status NOT NULL DEFAULT 'CREATED',
  razorpay_order_id     varchar(64) UNIQUE,
  razorpay_payment_id   varchar(64) UNIQUE,
  reference_id          uuid,                 -- subscription / booking id depending on purpose
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_payments_user ON payments (user_id, created_at DESC);
CREATE INDEX ix_payments_status ON payments (status, created_at DESC);
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id     int  NOT NULL REFERENCES subscription_plans(id),
  status      subscription_status NOT NULL DEFAULT 'PENDING',
  starts_at   timestamptz,
  ends_at     timestamptz,
  payment_id  uuid REFERENCES payments(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_subscriptions_user ON subscriptions (user_id, status);

-- =====================================================================
-- 20. Complaints  (+ user-to-user blocks, admin audit log)
-- =====================================================================
CREATE TABLE complaints (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  against_user_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  booking_id       uuid REFERENCES bookings(id) ON DELETE SET NULL,
  category         varchar(40) NOT NULL,
  description      text NOT NULL,
  status           complaint_status NOT NULL DEFAULT 'OPEN',
  admin_note       text,
  resolved_by      uuid REFERENCES users(id),
  resolved_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_complaints_status ON complaints (status, created_at DESC);

CREATE TABLE user_blocks (
  blocker_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE TABLE admin_audit_logs (
  id          bigserial PRIMARY KEY,
  admin_id    uuid NOT NULL REFERENCES users(id),
  action      varchar(60) NOT NULL,
  target_type varchar(40) NOT NULL,
  target_id   text NOT NULL,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_created ON admin_audit_logs (created_at DESC);
