# Vyooo Admin Dashboard

Production-grade admin panel for Vyooo platform control.

## Included in this implementation

- Firebase Auth login with secure server session cookie
- RBAC with Firebase custom claims (`admin`, `moderator`, `support`)
- Protected API layer (permission checks server-side)
- Audit logging for privileged actions (`admin_audit_logs`)
- Core modules:
  - Analytics overview
  - User management
  - CMS and content moderation
  - System monitoring
  - Audit log viewer

## Run

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Deploy to Firebase App Hosting

This project uses Next.js server routes and Firebase Admin SDK, so deploy with **Firebase App Hosting** (not static-only Hosting).

1) Login and select Firebase project

```bash
firebase login
firebase use <your_project_id>
```

2) Create App Hosting backend from Firebase Console

- Go to Firebase Console -> Build -> App Hosting
- Create a backend and connect this GitHub repository/branch
- Keep `apphosting.yaml` at repo root (already added)

3) Set required secrets for App Hosting

```bash
firebase apphosting:secrets:set NEXT_PUBLIC_BASE_URL
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_API_KEY
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_PROJECT_ID
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_APP_ID
firebase apphosting:secrets:set NEXT_PUBLIC_FIREBASE_DATABASE_URL
firebase apphosting:secrets:set FIREBASE_PROJECT_ID
firebase apphosting:secrets:set FIREBASE_CLIENT_EMAIL
firebase apphosting:secrets:set FIREBASE_PRIVATE_KEY
```

4) Grant backend access to secrets (if prompted)

```bash
firebase apphosting:secrets:grantaccess
```

5) Deploy

- Push to the connected branch; App Hosting will build and deploy automatically.
- Use App Hosting dashboard for logs, rollout status, and environment management.

## Firebase data contracts

- Firestore collections:
  - `users`
  - `content`
  - `admin_metrics` (doc id: `overview`)
  - `admin_audit_logs`
- Realtime Database path:
  - `systemHealth`

## Custom claims

Set one claim per admin user:

```json
{ "role": "admin" }
```

(also supported: `moderator`, `support`)
