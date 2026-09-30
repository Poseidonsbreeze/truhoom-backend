# Local PostgreSQL authentication

Authentication now uses the same local PostgreSQL database as profiles and bookings. Supabase keys are not used. DATABASE_URL must point to your local database (currently localhost:5432/truhoom).

Setup from truhoom-backend:

```powershell
npm install
npm run prisma:push
npm run prisma:generate
npm run dev
```

New signups receive a session immediately; no email confirmation is required. Passwords use salted scrypt hashes. Random access and refresh tokens are stored only as SHA-256 hashes in local_sessions. Access expires after one hour; refresh expires after 30 days and rotates on use. Logout revokes the session.

Existing profiles remain unchanged. Supabase passwords cannot be used locally. To give an existing account a local password, run:

```powershell
npm run auth:reset -- user@example.com
```

Paste the token printed by this operator-only command into the app's Reset Password screen and choose a new password. Tokens expire after 15 minutes, work once, and revoke existing sessions when consumed. No reset tokens are returned by the public API and no email is sent. The command requires local database access; do not expose it as an HTTP endpoint.

The schema change adds local_credentials, local_sessions, and password_resets without deleting profiles or bookings. Do not run the sample seed script to migrate authentication: it deletes existing application data.

Validation: npm run test:auth exercises the real local database using disposable test accounts and removes only those accounts afterward.
