# Database design

PostgreSQL 13+ (developed on 17). Migrations live in [`backend/migrations/`](../backend/migrations/) and are applied in filename order by `npm run migrate`; applied files are recorded in `schema_migrations`.

| File | Contents |
|---|---|
| `001_init.sql` | all enums, tables, keys, indexes, `updated_at` triggers |
| `002_master_data.sql` | classes (Nursery–Class 12), boards, subjects, starter localities in 10 cities, subscription plans |
| `003_refresh_token_reason.sql` | why a refresh token was revoked (theft detection only for rotated tokens) |

## Required tables → physical tables

| # | Spec table | Table(s) |
|---|---|---|
| 1 | Users | `users` (+ `otp_codes`, `refresh_tokens`) |
| 2 | ParentProfiles | `parent_profiles` (1:1 with users) |
| 3 | TutorProfiles | `tutor_profiles` (1:1 with users) + `tutor_qualifications`, `tutor_classes`, `tutor_boards` |
| 4 | Students | `students` (many per parent) |
| 5 | Subjects | `subjects` |
| 6 | Classes | `classes` |
| 7 | Boards | `boards` |
| 8 | TutorSubjects | `tutor_subjects` |
| 9 | TutorAvailability | `tutor_availability` (weekly slots) |
| 10 | TuitionRequirements | `tuition_requirements` + `requirement_subjects`, `saved_requirements` |
| 11 | TutorApplications | `tutor_applications` (tutor→requirement and parent→tutor) |
| 12 | Bookings | `bookings` (created on acceptance) |
| 13 | Messages | `conversations` + `messages` |
| 14 | Notifications | `notifications` + `announcements` |
| 15 | Reviews | `reviews` (one per booking) |
| 16 | Payments | `payments` (Razorpay order/payment ids) |
| 17 | Subscriptions | `subscription_plans` + `subscriptions` |
| 18 | TutorDocuments | `tutor_documents` |
| 19 | Locations | `locations` (locality master with coordinates) |
| 20 | Complaints | `complaints` + `user_blocks`, `admin_audit_logs` |

## Relationships

```
users ─1:1─ parent_profiles
users ─1:1─ tutor_profiles ─┬─< tutor_subjects >─ subjects
                            ├─< tutor_classes  >─ classes
                            ├─< tutor_boards   >─ boards
                            ├─< tutor_qualifications
                            ├─< tutor_availability
                            └─< tutor_documents
users(parent) ─< students ─< tuition_requirements ─< requirement_subjects >─ subjects
tuition_requirements ─< tutor_applications >─ users(tutor)
tutor_applications ─1:1─ bookings ─< reviews
tutor_applications ─1:1─ conversations ─< messages
users ─< notifications, payments, subscriptions >─ subscription_plans, complaints
```

## Key constraints and indexes

- `users.phone` unique; `lower(email)` unique (partial, when set).
- Duplicate-application protection: unique `(requirement_id, tutor_id)` where `requirement_id IS NOT NULL`; unique `(parent_id, tutor_id)` for **pending** direct requests.
- `reviews (booking_id, parent_id)` unique — one review per booking.
- CHECK constraints for ratings (1–5), days/week (1–7), coordinates, fees ≥ 0, `start_time < end_time`, radius 1–100 km.
- Search indexes: `tutor_profiles (verification_status, is_available, monthly_fee)`, partial geo index on approved tutors' `(latitude, longitude)`, partial index on open requirements, lower(city) and pincode indexes, join-table reverse indexes (`subject_id`, `class_id`, `board_id`).
- Distance is computed with the haversine formula after an index-friendly bounding-box prefilter (no PostGIS dependency). For very large datasets, switch to PostGIS `geography` + GiST.

## Privacy-sensitive columns

`parent_profiles.address_line/latitude/longitude` and `tuition_requirements.latitude/longitude` are never returned to anyone except the owner. Tutor-facing queries return rounded coordinates only.
