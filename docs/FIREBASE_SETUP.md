# Firebase & Google configuration

Phase 1 runs **without Firebase**: OTPs are generated and verified by the backend (shown in dev, sent through a pluggable SMS sender in production), and in-app notifications are stored in the database. This guide covers what to set up for production and Phase 2.

## 1. Create the Firebase project

1. <https://console.firebase.google.com> → **Add project** → "Smart Tuition".
2. **Add app → Android**, package name `com.smarttuition.app`. Add your debug and release SHA-1/SHA-256 (`./gradlew signingReport`).
3. Download `google-services.json` to `android/app/` (it is git-ignored).

## 2. OTP delivery — choose one

**Option A — backend OTP + SMS gateway (current implementation).**
Implement `SmsSender` in `backend/src/services/sms.ts` for your provider (MSG91, Twilio, Gupshup, AWS SNS…) and select it with `SMS_PROVIDER`. Indian DLT registration of the sender ID and template is required for transactional SMS. Set `OTP_DEV_MODE=false`.

**Option B — Firebase Phone Authentication.**
1. Firebase console → Authentication → Sign-in method → enable **Phone**.
2. Android: add `com.google.firebase:firebase-auth` and use `PhoneAuthProvider` to verify the number on device; obtain the Firebase ID token.
3. Backend: add `firebase-admin`, set `FIREBASE_SERVICE_ACCOUNT_PATH`, add a `POST /auth/firebase { idToken, role?, fullName?, email? }` endpoint that calls `admin.auth().verifyIdToken()`, takes `phone_number` from the token, then reuses `issueTokens()` from `auth.service.ts`. Everything after login (JWT, roles) stays the same.

## 3. Firebase Cloud Messaging (Phase 2)

1. Android: apply `com.google.gms.google-services` plugin, add `firebase-messaging`, implement a `FirebaseMessagingService` that sends `onNewToken` to `PUT /auth/fcm-token`, and request `POST_NOTIFICATIONS` on Android 13+.
2. Backend: Project settings → Service accounts → **Generate new private key**; store the JSON outside the repo and set `FIREBASE_SERVICE_ACCOUNT_PATH`.
3. Register an FCM sender at start-up with `setPushSender()` from `backend/src/services/notifications.ts` (it receives `fcmToken, title, body, data`). Every existing `notify()` call then also produces a push.

## 4. Google Maps

1. Google Cloud console (same project) → enable **Maps SDK for Android**.
2. Create an API key restricted to *Android apps* with your package name + SHA-1.
3. Put it in `android/local.properties`: `MAPS_API_KEY=AIza...`. Without a key the app hides map previews and everything else keeps working.

## 5. Cloud storage for photos & certificates

Phase 1 stores files on the server disk (`UPLOAD_DIR`). For production use Firebase Storage / Google Cloud Storage or S3: implement `saveFile`, `deleteFile` and private file streaming in `backend/src/services/storage.ts` (keep certificates in a **private** bucket and serve them through the existing authorised routes or short-lived signed URLs).
