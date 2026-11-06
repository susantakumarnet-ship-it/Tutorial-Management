# Deployment

## Backend API

Requirements: Node.js 20+, PostgreSQL 13+ (managed: AWS RDS, Google Cloud SQL, Azure, Neon, Supabase…), HTTPS reverse proxy.

```bash
cd backend
npm ci
npm run build                  # → dist/
NODE_ENV=production npm run migrate
npm run create-admin -- --name "Your Name" --phone 9XXXXXXXXX --email you@company.com
NODE_ENV=production node dist/server.js
```

Production environment (see `.env.example`):

| Variable | Production value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | managed Postgres URL (use `?sslmode=require` where supported) |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `OTP_PEPPER` | independent random secrets, e.g. `openssl rand -hex 48` |
| `OTP_DEV_MODE` | `false` — the server refuses to start in production otherwise |
| `SMS_PROVIDER` | your implemented provider |
| `CORS_ORIGINS` | the admin dashboard origin(s) |
| `UPLOAD_DIR` | a persistent volume, or switch storage to a cloud bucket (see FIREBASE_SETUP.md §5) |

Run behind nginx / a load balancer terminating TLS (the app sets `trust proxy` for correct client IPs in rate limiting). Use a process manager (systemd, PM2) or a container; the server handles `SIGTERM` gracefully. Health check: `GET /health`. Logs are JSON (pino) on stdout.

Back up the database daily; uploads too if stored on disk.

## Admin dashboard

```bash
cd admin-dashboard
VITE_API_BASE_URL=https://api.yourdomain.com/api/v1 npm run build
```

Serve `dist/` from any static host (Netlify, Vercel, S3 + CloudFront, nginx) with an SPA fallback to `index.html`. Add the dashboard origin to the API's `CORS_ORIGINS`.

## Android app

1. `android/local.properties`:
   ```
   API_BASE_URL_RELEASE=https://api.yourdomain.com/api/v1/
   MAPS_API_KEY=AIza...
   ```
2. Create an upload keystore and a signing config (keep the keystore out of git), then:
   ```bash
   ./gradlew :app:bundleRelease     # → app/build/outputs/bundle/release/app-release.aab
   ```
3. Upload the AAB to Google Play Console. Release builds are minified (R8) and HTTPS-only.
4. Play Console data-safety form: the app collects name, phone, email, approximate/precise location (optional, for search), photos and documents (tutors). Data relating to children is entered by parents; describe the privacy controls above.
