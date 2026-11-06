# Smart Tuition

A two-sided marketplace that connects parents looking for tuition teachers with verified tutors looking for students.

| Part | Path | Stack |
|---|---|---|
| REST API | [`backend/`](backend/) | Node.js 20+, Express, TypeScript, PostgreSQL, JWT |
| Android app (parents + tutors) | [`android/`](android/) | Kotlin, Jetpack Compose, Material 3, MVVM, Hilt, Retrofit |
| Admin dashboard | [`admin-dashboard/`](admin-dashboard/) | React 18, TypeScript, Material UI 6, Vite |

## Build status — Phase 1

The spec asks for module-by-module delivery. **Phase 1** (this delivery) covers authentication, role management, parent registration, tutor registration, tuition posting and tutor discovery, plus what is needed to make them usable end-to-end.

| Area | Status |
|---|---|
| Registration & login with mobile OTP, JWT access + rotating refresh tokens, role-based access | ✅ |
| Parent profile, multiple children per account | ✅ |
| Tutor profile: photo, qualifications, experience, subjects, classes, boards, fee, mode, location + service radius, weekly availability, Available/Not available toggle | ✅ |
| Certificate / document upload (type-sniffed, private) and submit-for-verification | ✅ |
| Admin verification — tutors are **not** searchable until approved | ✅ |
| Post / edit / close tuition requirements | ✅ |
| Tutor search with filters: class, subject, board, location (GPS radius, city, pincode), online/home, fee, experience, gender, available day & time; sorting | ✅ |
| Tutors find students: nearby/online requirements, filters, "matches my profile", save requirements | ✅ |
| Apply for tuition / parent direct request → accept / reject / withdraw; duplicate prevention; contact details revealed only after acceptance | ✅ |
| In-app notifications (stored) for applications, decisions and verification | ✅ |
| Admin: stats, tutor verification, document review, user block/unblock, requirement moderation, audit log | ✅ |
| Database schema for **all 20 required tables** (+ supporting tables) | ✅ |
| Chat, demo-class scheduling & booking confirmation, reviews UI | ⏳ Phase 2 (tables exist; a `booking` + `conversation` row is already created on acceptance) |
| Firebase Cloud Messaging push, demo reminders, admin announcements | ⏳ Phase 2 (`notify()` already has a pluggable push sender) |
| Razorpay subscriptions, featured listings, payment history | ⏳ Phase 3 (tables + plans seeded; app works without payment) |
| Complaints/reviews/subjects/locations admin pages | ⏳ Phase 2 (placeholders in dashboard) |

## Quick start (local, no Docker or Postgres install needed)

Prerequisites: Node.js 20+ (tested on 24). Android Studio Ladybug or newer for the app.

```bash
# 1. Database — starts a real PostgreSQL 17 on port 5433 (data kept in backend/.pgdata)
cd backend
npm install
npm run db:local          # leave running in its own terminal

# 2. API — in a second terminal
cd backend
cp .env.example .env      # defaults work for local dev
npm run migrate
npm run seed              # demo data (optional)
npm run dev               # http://localhost:4100  (health: /health)

# 3. Admin dashboard — third terminal
cd admin-dashboard
npm install
npm run dev               # http://localhost:5173

# 4. Android — open android/ in Android Studio, run on an emulator.
#    Debug builds call http://10.0.2.2:4100/api/v1/ (the host machine).
```

> Port 4100 is used because 4000 is commonly taken. Change `PORT` in `backend/.env` and `API_BASE_URL_DEBUG` in `android/local.properties` together if needed.

### Demo accounts (after `npm run seed`)

`OTP_DEV_MODE=true` returns the OTP in the API response and the app/dashboard display it, so no SMS gateway is needed locally.

| Role | Mobile |
|---|---|
| Admin (dashboard) | 9000000001 |
| Parents | 9000000101 (Bengaluru, 2 children), 9000000102 (Mumbai), 9000000103 |
| Tutors (approved) | 9000000201 … 9000000212 |
| Tutors (pending verification) | 9000000213, 9000000214 |

## Documentation

- [API reference](docs/API.md)
- [Database design](docs/DATABASE.md)
- [Firebase setup](docs/FIREBASE_SETUP.md) (phone auth alternative, FCM, Maps key)
- [Testing](docs/TESTING.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Android app](android/README.md) · [Admin dashboard](admin-dashboard/README.md)

## Security & privacy highlights

- OTPs are random 6-digit codes, stored only as HMAC-SHA256, single-use, 5-minute expiry, 5 wrong attempts max, 30 s resend cooldown, 5 per hour per number, plus IP rate limiting.
- Short-lived JWT access tokens (15 min) and opaque refresh tokens stored hashed and rotated on every use; reuse of a rotated token revokes every session of that user.
- Blocking a user takes effect immediately (status is re-checked on every request; refresh tokens revoked).
- Role checks on every route; admins can only be created from the server CLI (`npm run create-admin`).
- **Children's data:** tutors never see the child's name, the parent's name (first name only until accepted), phone, email or exact coordinates. Locations shown to tutors are rounded to ~1 km and distances to 0.5 km. Contact details are released only to the two parties of an **accepted** application.
- Uploads: type detected from file magic bytes (PDF/JPG/PNG/WebP only), 5 MB limit, random storage keys, certificates served only to the owner and admins with `no-store`.
- Duplicate applications prevented by partial unique indexes; parameterised SQL everywhere; helmet, CORS allow-list, JSON body size limit; centralised error handling and structured logging (pino) with auth headers redacted.
- Android: tokens encrypted with an Android Keystore AES-GCM key, excluded from backups; release builds HTTPS-only.
