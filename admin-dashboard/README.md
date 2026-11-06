# Smart Tuition - Admin Dashboard

Web admin console for the Smart Tuition tutor/parent marketplace. Administrators use it to verify
tutors, manage users and moderate tuition requirements.

Stack: Vite 6, React 18, TypeScript, Material UI v6 and React Router v6. Only those libraries are
used; API calls go through a small `fetch` wrapper with no state library.

## Prerequisites

- Node.js 20+ (built with Node 24 / npm 11)
- The Smart Tuition backend running (default `http://localhost:4100`), with
  `http://localhost:5173` in its `CORS_ORIGINS`

## Setup

```bash
cd admin-dashboard
npm install
# npm 11 blocks install scripts by default. If Vite complains that esbuild is missing, run:
npm install-scripts approve esbuild
npm rebuild esbuild

cp .env.example .env      # optional: only needed to change the API URL
npm run dev               # http://localhost:5173
```

The dev server is pinned to port **5173** (`strictPort`) because that is the origin the backend's
CORS allows. If the port is busy, Vite fails instead of moving to another port.

## Environment variables

| Variable            | Default                         | Description                                  |
| ------------------- | ------------------------------- | -------------------------------------------- |
| `VITE_API_BASE_URL` | `http://localhost:4100/api/v1`  | Backend REST base URL, including `/api/v1`.  |

Relative file paths returned by the API (such as `/api/v1/files/photos/...`) are resolved against
the origin of `VITE_API_BASE_URL`. Vite inlines the variable at build time, so rebuild after you
change it.

## Scripts

| Script              | What it does                                         |
| ------------------- | ---------------------------------------------------- |
| `npm run dev`       | Start the dev server on http://localhost:5173        |
| `npm run build`     | Type-check (`tsc -b`) and build to `dist/`           |
| `npm run typecheck` | Type-check only                                      |
| `npm run preview`   | Serve the production build on http://localhost:5173 |

## Signing in

You sign in with a phone number and OTP. Only accounts with the `ADMIN` role are accepted. Any
other account is signed out straight away with a message.

When the backend runs with `OTP_DEV_MODE=true`, the login response includes the OTP. The OTP step
then shows it in a dismissible info banner (click the code to fill it in), so the demo works
without SMS. With the seeded data, the demo admin number is **9000000001**.

## Features

- **Dashboard**: platform stat cards (users, tutors, requirements, applications, complaints,
  revenue in INR) and a 14-day signups bar chart drawn in plain SVG, with a table view.
- **Tutor verification**: tabs by status (Pending, Approved, Rejected, Draft, All), search and
  paging. The tutor detail page shows the photo, contact details, subjects, classes, boards,
  qualifications, availability, location, fee and the verification note. Admins can view each
  document (fetched as an authenticated blob) and approve or reject it, and can approve or reject
  the whole profile (rejection needs a reason).
- **Users**: filter by role and status, search, block (needs a reason) and unblock.
- **Requirements**: filter by status and close open requirements (with a confirmation step).
- **Coming in next phase** (placeholder pages): Complaints, Reviews, Subscriptions & Payments,
  Announcements, Subjects & Locations.

List filters and the current page are kept in the URL, so Back from a detail page brings you
back to the same view.

## Authentication details

- Tokens are stored in `localStorage` (`smartTuition.admin.session`).
- The access token lasts 15 minutes. The client refreshes it shortly before it expires, and also
  when a request gets a `401`, then retries that request once.
- Only one refresh runs at a time, both within a tab and across tabs (Web Locks API). This matters
  because the backend rotates refresh tokens and treats reuse of a revoked token as theft, which
  revokes every session for that user.
- If the refresh is rejected, or the account is blocked, the session is cleared and the login page
  shows why.
- API errors (`{ error: { code, message } }`) appear as snackbars.

## Project layout

```
src/
  api/          fetch wrapper (auth + refresh), endpoint functions, response types
  auth/         AuthContext (login/logout/session) and route guard
  components/   layout shell, data table, dialogs, notifier, chart, status chips
  pages/        one file per screen
  theme/        MUI theme
  utils/        formatting helpers and hooks
```
