# Testing

## Backend — automated integration tests

```bash
cd backend
npm test
```

- Runs with Vitest + Supertest against a **real PostgreSQL 17** that the test harness starts on port 5434 in a temp directory (via `embedded-postgres`), migrates, and deletes afterwards. No external services needed.
- `npm run typecheck` — TypeScript strict mode.

What is covered (30 tests in `tests/auth.test.ts` and `tests/marketplace.test.ts`):

| Area | Checks |
|---|---|
| Auth | register → OTP → tokens; field validation; cannot self-register as admin; wrong-OTP lockout after 5 attempts; resend cooldown; duplicate number; refresh rotation + reuse detection; logout doesn't revoke other sessions |
| RBAC | parent/tutor/admin route isolation, unauthenticated access |
| Blocking | blocked user rejected immediately, can't request OTP, unblock restores access |
| Parents | multiple children, ownership enforcement, profile update |
| Tutor onboarding | completeness report, incomplete submission refused, fake file content rejected by magic-byte sniffing, full approve flow incl. notification, rejection requires reason |
| Discovery | not searchable before approval; filters by class/subject/board/fee/gender/mode/distance/day/time/city; online ignores distance; public profile hides contact & exact location |
| Requirements | create/list/edit/close; can't post for another family's child; tutors see nearby requirements without names or exact coordinates; distant tutors don't; gender preference enforced; save/unsave |
| Applications | apply → parent notified → accept → contact revealed to both; duplicate prevention; tutor can't accept own application; only verified tutors can apply; direct requests (one pending at a time); withdraw rules |
| Admin | stats, lists and filters |

## Android

```bash
cd android
./gradlew :app:assembleDebug        # compile check
./gradlew :app:testDebugUnitTest    # JVM unit tests
```

Unit tests cover the query-building logic for tutor/student filters and input validators.

### Manual test script (emulator + seeded backend)

1. **Parent**: Get started → Parent → register with a new number → enter the OTP shown in the yellow banner → Home.
2. Home → Manage → add two children.
3. Post requirement → pick child, subjects, timing, budget → search "Indiranagar" → Select → Post. The requirement detail opens.
4. Find Tutors → "Near me" (allow location; on the emulator set a location near Bengaluru) or set city "Bengaluru" in filters → open Ananya Rao → Request tuition.
5. **Tutor**: log out → log in as 9000000201 → Home shows the matching requirement → open → Apply.
6. Log in as the parent → bell shows a notification → open → Accept → Call / Email buttons appear.
7. **New tutor**: register as tutor → Complete profile (photo, subjects, classes, boards, fee, location, qualification, a slot, a PDF certificate) → Save → Submit for verification.
8. **Admin dashboard** (http://localhost:5173, 9000000001) → Tutors → Pending → open the tutor → view document → Approve. The tutor's Home now shows "verified" and they appear in parent search.
9. Admin → Users → block the parent → the app returns to the welcome screen on the next request.

## Admin dashboard

```bash
cd admin-dashboard
npm run build     # tsc -b && vite build — type-checks everything
```
