# Smart Tuition — Android app

One app for both **parents/students** and **tutors**; the role chosen at sign-up decides which dashboard is shown.

Kotlin 2.1 · Jetpack Compose (Material 3) · MVVM · Hilt · Retrofit + kotlinx.serialization · Navigation Compose (type-safe routes) · DataStore (Keystore-encrypted tokens) · Coil · Fused Location · Maps Compose. minSdk 24, targetSdk 35.

## Run

1. Start the backend (see the root README). Debug builds call `http://10.0.2.2:4100/api/v1/`, the host machine as seen from the Android emulator.
2. Open this `android/` folder in Android Studio (Ladybug or newer, JDK 17) and run the `app` configuration.
3. Optional `android/local.properties` entries:
   ```properties
   MAPS_API_KEY=AIza...                                  # enables service-area maps
   API_BASE_URL_DEBUG=http://192.168.1.20:4100/api/v1/   # physical device on your Wi-Fi*
   API_BASE_URL_RELEASE=https://api.yourdomain.com/api/v1/
   ```
   \*For a physical device, either use `adb reverse tcp:4100 tcp:4100` with `http://localhost:4100/api/v1/`, or add your LAN IP to `app/src/debug/res/xml/network_security_config.xml`.

Command line: `./gradlew :app:assembleDebug` and `./gradlew :app:testDebugUnitTest`.

## Structure

```
app/src/main/java/com/smarttuition/app/
├── core/
│   ├── network/      ApiService (all endpoints), ApiResult + error mapping, auth interceptor, token-refresh authenticator
│   ├── session/      TokenStore (encrypted DataStore), SessionManager (signed-in state drives navigation)
│   ├── location/     one-shot GPS location
│   └── util/         formatting (₹, time ago), validators
├── data/
│   ├── model/        DTOs matching docs/API.md
│   └── repository/   Auth, Meta (cached), Parent, Tutor (uploads), Requirement, Application, Notification
├── di/               Hilt module (OkHttp, Retrofit, Json)
├── ui/
│   ├── theme/        Material 3 colour scheme (light + dark), typography, shapes
│   ├── components/   buttons, chips, dropdowns, cards, empty/error/loading states, Ui<T> load-state helper
│   └── navigation/   routes + NavHost with role-specific bottom navigation
└── feature/
    ├── auth/         Welcome, Role selection, Register, Login, OTP
    ├── parent/       Dashboard, My children, Post requirement, Search tutors (+ filters), Tutor profile, Requirement detail
    ├── tutor/        Dashboard (verification progress, availability toggle), Edit profile (photo, documents, qualifications, slots), Find students, Requirement detail + Apply
    ├── applications/ My requests (tabs) and request detail (accept / decline / withdraw, contact reveal)
    ├── notifications/
    └── account/      Profile, privacy note, log out
```

## Screens in Phase 1

Splash (system splash while the saved session is checked) · Welcome · Role selection · Register · Login · OTP verification · Parent dashboard · Tutor dashboard · Search tutors · Find students · Tutor profile · Requirement details (parent & tutor) · Post/edit requirement · Apply for tuition · My requests / My students · Notifications · Profile management · Account/settings.

Chat, booking and payment screens arrive with the Phase 2/3 backend modules.
