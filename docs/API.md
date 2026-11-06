# Smart Tuition REST API (v1)

Base URL: `http://localhost:4100/api/v1` (local). All bodies are JSON unless noted.

**Auth:** send `Authorization: Bearer <accessToken>` on every route marked 🔒. Access tokens last 15 minutes; use `POST /auth/refresh` to rotate.

**Errors** always look like:

```json
{ "error": { "code": "BAD_REQUEST", "message": "Invalid request body", "details": [{ "field": "phone", "message": "Enter a valid 10-digit Indian mobile number" }] } }
```

| HTTP | code | When |
|---|---|---|
| 400 | `BAD_REQUEST` / `UPLOAD_ERROR` | validation failure (see `details`) |
| 401 | `UNAUTHORIZED` | missing/expired token |
| 403 | `FORBIDDEN` | wrong role, blocked account, tutor not verified |
| 404 | `NOT_FOUND` | not found **or not yours** (ownership is never leaked) |
| 409 | `CONFLICT` | duplicate (already applied, number already registered, …) |
| 429 | `TOO_MANY_REQUESTS` | OTP limits / rate limiting |

**Paged lists** return `{ items, page, pageSize, total, totalPages }`. Query: `page` (default 1), `pageSize` (default 20, max 50).

Phone numbers accept `9876543210`, `09876543210`, `+919876543210` and are normalised to `+919876543210`.

---

## Auth

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/register` | `{ role: "PARENT"\|"TUTOR", fullName, phone, email }` | `201 { otpSentTo, expiresInSeconds, devOtp? }` |
| POST | `/auth/login` | `{ phone }` | `{ otpSentTo, expiresInSeconds, devOtp? }` (also used for "resend") |
| POST | `/auth/verify-otp` | `{ phone, code }` | `{ accessToken, refreshToken, accessTokenExpiresAt, user }` |
| POST | `/auth/refresh` | `{ refreshToken }` | same as verify-otp (new pair; old token is revoked) |
| POST | `/auth/logout` | `{ refreshToken }` | `204` |
| GET 🔒 | `/auth/me` | | `user` |
| PUT 🔒 | `/auth/fcm-token` | `{ token \| null }` | `204` |

`user` = `{ id, role, fullName, phone, email, phoneVerified, status, photoUrl, tutorVerificationStatus, profileComplete, createdAt }`

`devOtp` is present only when the server runs with `OTP_DEV_MODE=true` (refused in production).

## Reference data (public)

| GET | Response |
|---|---|
| `/meta` | `{ classes: [{id,name}], boards: [{id,name,code}], subjects: [{id,name}] }` (cacheable 1 h) |
| `/meta/locations?q=&city=&pincode=&limit=` | `[{ id, locality, city, state, pincode, latitude, longitude }]` |
| `/meta/cities` | `["Bengaluru", ...]` |

## Parent 🔒 (role PARENT)

| Method | Path | Notes |
|---|---|---|
| GET | `/parents/me` | profile + `students[]` |
| PUT | `/parents/me` | any of `fullName, email, addressLine, locationId, city, pincode, latitude, longitude`; omitted keys unchanged, `null` clears |
| GET | `/parents/me/students` | |
| POST | `/parents/me/students` | `{ name, classId, boardId?, schoolName?, gender? }` (max 10) |
| PUT | `/parents/me/students/:id` | same body |
| DELETE | `/parents/me/students/:id` | soft delete; closes that child's open requirements |

## Tutor — own profile 🔒 (role TUTOR)

| Method | Path | Notes |
|---|---|---|
| GET | `/tutors/me` | full profile incl. documents and `completeness: { complete, missing[] }` |
| PUT | `/tutors/me` | partial: `fullName, email, headline, bio, gender, experienceYears, experienceDetails, monthlyFee, teachingMode (ONLINE/OFFLINE/BOTH), locationId, locality, city, pincode, latitude, longitude, serviceRadiusKm, subjectIds[], classIds[], boardIds[]` (arrays replace). Choosing `locationId` fills missing address fields. |
| PUT | `/tutors/me/qualifications` | `{ qualifications: [{ degree, institution?, year? }] }` (replaces) |
| PUT | `/tutors/me/availability` | `{ slots: [{ dayOfWeek 0=Sun..6, startTime "HH:mm", endTime }] }` (replaces) |
| PATCH | `/tutors/me/availability-status` | `{ isAvailable }` |
| POST | `/tutors/me/photo` | multipart field `photo` (JPG/PNG/WebP ≤ 5 MB) → `{ photoUrl }` |
| GET | `/tutors/me/documents` | |
| POST | `/tutors/me/documents` | multipart: `docType` (QUALIFICATION/EXPERIENCE/ID_PROOF/OTHER) + `file` (PDF/JPG/PNG ≤ 5 MB) |
| GET | `/tutors/me/documents/:id/file` | the file (private) |
| DELETE | `/tutors/me/documents/:id` | not allowed once approved |
| POST | `/tutors/me/submit-for-verification` | DRAFT/REJECTED → PENDING; `400` with `details` = missing items if incomplete |

Photos are public at `/api/v1/files/photos/...` (the `photoUrl` path).

## Tutor discovery 🔒 (PARENT, ADMIN)

`GET /tutors/search` — only **approved, available, active** tutors.

| Query | Meaning |
|---|---|
| `classId`, `subjectId`, `boardId` | must teach it |
| `lat`, `lng`, `radiusKm` (default 10) | distance filter + `distanceKm` in results |
| `city`, `pincode` | used when no lat/lng |
| `mode` | `ONLINE` (distance ignored) or `OFFLINE` (home tuition — must also be within the tutor's own service radius) |
| `minFee`, `maxFee`, `minExperience`, `gender` (MALE/FEMALE) | |
| `dayOfWeek`, `timeFrom`, `timeTo` | has an availability slot covering it |
| `q` | name / headline contains |
| `sort` | `relevance` (default), `distance`, `rating`, `fee_low`, `fee_high`, `experience` — featured tutors always first |

`GET /tutors/:id` — public profile with subjects, classes, boards, qualifications, availability, last 10 reviews, `verifiedDocuments`, approximate (~1 km) location, `connection` (your pending/accepted application, if any) and `contact` (**only** once you have an accepted application).

## Tuition requirements 🔒

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/requirements` | PARENT | `{ studentId, subjectIds[], daysPerWeek 1-7, preferredTime, preferredTutorGender ANY/MALE/FEMALE, monthlyBudget, mode HOME/ONLINE/EITHER, classId?, boardId?, locationId?, locality?, city?, pincode?, latitude?, longitude?, additionalNotes? }`. Class/board default from the child. Location required unless ONLINE. Max 10 open. |
| GET | `/requirements/mine?status=` | PARENT | with `applicationCount`, `pendingApplications` |
| PUT | `/requirements/:id` | PARENT | same body; only while OPEN |
| POST | `/requirements/:id/close` | PARENT | |
| GET | `/requirements/discover` | TUTOR | query: `lat,lng,radiusKm` (default: own location & service radius), `city, pincode, classId, subjectId, boardId, minBudget, maxBudget, mode ONLINE/HOME, matchProfile=true, savedOnly=true, sort newest/distance/budget_high`. Respects the parent's gender preference and blocks. Online requirements are included regardless of distance for tutors who teach online. |
| GET | `/requirements/saved` | TUTOR | |
| PUT / DELETE | `/requirements/:id/save` | TUTOR | |
| GET | `/requirements/:id` | PARENT (own, full) / TUTOR (privacy-safe, with `hasApplied`, `applicationId`, `applicationStatus`, `isSaved`) | |

Tutor views never include student name, parent identity or exact coordinates (`approxLatitude/approxLongitude` are rounded to 0.01°; `distanceKm` to 0.5 km).

## Applications & requests 🔒 (PARENT, TUTOR)

| Method | Path | Who | Notes |
|---|---|---|---|
| POST | `/applications` | TUTOR (verified) | `{ requirementId, message?, proposedFee? }` — 409 if already applied |
| POST | `/applications/direct` | PARENT | `{ tutorId, studentId, message? }` — one pending request per tutor |
| GET | `/applications?box=incoming\|outgoing&status=&requirementId=` | both | |
| GET | `/applications/:id` | parties | |
| POST | `/applications/:id/accept` | recipient | creates a booking (`DEMO_PENDING`) and a conversation; reveals contact details to both |
| POST | `/applications/:id/reject` | recipient | |
| POST | `/applications/:id/withdraw` | initiator | pending only |

Application object: `{ id, status, initiatedBy, direction, message, proposedFee, createdAt, respondedAt, canRespond, canWithdraw, requirement{…}, tutor{…, contact}, parent{ id, fullName, contact }, student{ id, name, className }, bookingId, bookingStatus, conversationId }` — `contact` and `student.name` are null until accepted.

## Notifications 🔒

| Method | Path |
|---|---|
| GET | `/notifications` → paged + `unread` |
| GET | `/notifications/unread-count` |
| POST | `/notifications/:id/read` |
| POST | `/notifications/read-all` |

Types: `APPLICATION_RECEIVED`, `TUITION_REQUEST_RECEIVED`, `APPLICATION_ACCEPTED`, `APPLICATION_REJECTED`, `TUTOR_APPROVED`, `TUTOR_REJECTED`. `data` carries ids such as `applicationId`.

## Admin 🔒 (role ADMIN)

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/stats` | counts + 14-day `signups` |
| GET | `/admin/tutors?status=&q=` | pending first |
| GET | `/admin/tutors/:id` | full profile incl. contact & documents |
| POST | `/admin/tutors/:id/approve` | `{ note? }` — also approves pending documents |
| POST | `/admin/tutors/:id/reject` | `{ note }` (required) |
| GET | `/admin/documents/:id/file` | |
| POST | `/admin/documents/:id/review` | `{ status: APPROVED/REJECTED, note? }` (note required for rejection) |
| GET | `/admin/users?role=&status=&q=` | |
| POST | `/admin/users/:id/block` | `{ reason }` — revokes sessions immediately |
| POST | `/admin/users/:id/unblock` | |
| GET | `/admin/requirements?status=` | |
| POST | `/admin/requirements/:id/close` | |

Every admin action is written to `admin_audit_logs`.

## Health

`GET /health` → `{ "status": "ok" }` (503 if the database is unreachable).
