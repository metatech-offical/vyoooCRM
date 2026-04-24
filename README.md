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
