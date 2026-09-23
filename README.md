> Authentication now runs on local PostgreSQL. See [LOCAL_AUTH.md](LOCAL_AUTH.md) for setup and existing-account password resets.

# Truhoom Backend API Contract

## Admin Panel

The admin panel is a standalone SPA served at `/admin` that provides:
- Financial dashboard with metrics and insights
- Payout management for artisan payments via Paystack
- Booking monitoring

### Admin Setup

1. Add to your `.env`:
   ```
   ADMIN_EMAIL=admin@yourdomain.com
   ADMIN_PASSWORD=your-secure-password
   ADMIN_NAME=Admin User
   ```

2. Run database migration (after schema changes):
   ```bash
   npx prisma migrate dev --name add_admin_role
   ```

3. Create the admin user:
   ```bash
   npm run admin:create
   ```

4. Start the backend:
   ```bash
   npm run dev
   ```

5. Access the admin panel at `http://localhost:3000/admin`

### Admin API Endpoints

All admin endpoints require `Authorization: Bearer <token>` with ADMIN role.

- `GET /api/admin/dashboard` - Financial summary, recent payouts, recent bookings
- `POST /api/admin/payouts/:id/release` - Initiate Paystack transfer for artisan payout

## Paystack marketplace payments

Set `PAYSTACK_SECRET_KEY` only in the backend `.env`. Set `PLATFORM_FEE_PERCENT` to Truhoom's commission percentage. Customers pay the agreed booking price through Paystack; the backend verifies the exact reference, NGN currency and amount before marking the booking paid. Artisans cannot start unpaid work in the app. After the artisan marks the work finished and the customer confirms, Truhoom initiates a transfer for the artisan net amount using the artisan's verified Paystack recipient.

Configure the Paystack dashboard webhook as `https://YOUR_API_HOST/api/payments/webhook`. A public HTTPS deployment is required because Paystack cannot send webhooks to localhost.

This document is intended for the backend team. It summarizes the API endpoints and payloads expected by the current frontend.

## Base URL

The frontend currently uses:

- `http://localhost:3000` by default
- or the value from `EXPO_PUBLIC_API_URL`

## Authentication

Most authenticated requests expect:

- `Authorization: Bearer <access_token>`

The frontend also uses refresh tokens for session renewal.

---

## Auth Endpoints

### 1. Sign up
- **Method:** `POST`
- **Path:** `/auth/signup`
- **Purpose:** Create a new account

**Request body**
```json
{
  "email": "user@example.com",
  "password": "secret123",
  "fullName": "Ada Lovelace"
}
```

**Expected response**
- User created successfully
- Session info returned if your auth flow returns it

### 2. Log in
- **Method:** `POST`
- **Path:** `/auth/login`
- **Purpose:** Authenticate an existing user

**Request body**
```json
{
  "email": "user@example.com",
  "password": "secret123"
}
```

### 3. Google login
- **Method:** `POST`
- **Path:** `/auth/google`

**Request body**
```json
{
  "accessToken": "google-access-token"
}
```

### 4. Apple login
- **Method:** `POST`
- **Path:** `/auth/apple`

**Request body**
```json
{
  "identityToken": "apple-identity-token"
}
```

### 5. Logout
- **Method:** `POST`
- **Path:** `/auth/logout`
- **Auth required:** Yes

### 6. Refresh session
- **Method:** `POST`
- **Path:** `/auth/refresh`

**Request body**
```json
{
  "refreshToken": "refresh-token"
}
```

### 7. Forgot password
- **Method:** `POST`
- **Path:** `/auth/forgot-password`

**Request body**
```json
{
  "email": "user@example.com"
}
```

### 8. Reset password
- **Method:** `POST`
- **Path:** `/auth/reset-password`

**Request body**
```json
{
  "accessToken": "access-token",
  "newPassword": "new-secret-123"
}
```

### 9. Get current user
- **Method:** `GET`
- **Path:** `/auth/me`
- **Auth required:** Yes

### 10. Complete profile
- **Method:** `POST`
- **Path:** `/auth/complete-profile`
- **Auth required:** Yes

**Request body**
```json
{
  "fullName": "Ada Lovelace",
  "phone": "08012345678",
  "address": "Lagos, Nigeria",
  "role": "CUSTOMER"
}
```

---

## Booking Endpoints

### 11. Create instant booking
- **Method:** `POST`
- **Path:** `/api/bookings/instant`
- **Auth required:** Yes
- **Role restriction:** Only `CUSTOMER`

**Request body**
```json
{
  "serviceId": 1,
  "scheduledAt": "2026-08-10T15:00:00.000Z",
  "location": {
    "lat": 6.5244,
    "lng": 3.3792
  }
}
```

**Expected behavior**
- Create a booking request
- Mark it as broadcast/dispatch-ready
- Emit a real-time event for matching artisans

### 12. Create quote booking
- **Method:** `POST`
- **Path:** `/api/bookings/quote`
- **Auth required:** Yes
- **Role restriction:** Only `CUSTOMER`

**Request body**
```json
{
  "artisanId": 2,
  "serviceId": 1,
  "scheduledAt": "2026-08-10T15:00:00.000Z",
  "location": {
    "lat": 6.5244,
    "lng": 3.3792
  }
}
```

**Expected behavior**
- Create a quote-based booking request
- Assign it to the selected artisan
- Emit a real-time event to the artisan room

---

## Health Check

### 13. Health endpoint
- **Method:** `GET`
- **Path:** `/api/health`

**Expected response**
```json
{
  "status": "ok",
  "timestamp": "2026-08-10T00:00:00.000Z"
}
```

---

## Real-time Events

The frontend also connects via Socket.IO and joins rooms using these events:

- `join:artisan`
- `join:customer`

Server-side events emitted to clients:

- `DISPATCH_BROADCAST`
- `QUOTE_ASSIGNED`

---

## Notes for implementation

- Booking location must include valid latitude and longitude values.
- The frontend expects JSON responses and standard HTTP error handling.
- Authentication flows should return enough session data for the app to persist login state.
- For booking requests, the frontend sends `serviceId` and `location` in a simple JSON structure.

If you want, I can also convert this into a more formal OpenAPI/Swagger file for the backend team.
