# Truhoom API Documentation

## Base URL
```
http://localhost:3000
```

## Authentication
All protected endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <access_token>
```

Tokens are obtained via `/auth/login`, `/auth/signup`, or OAuth endpoints.

## Health Check
### GET /api/health
**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

## Authentication Endpoints

### POST /auth/signup
Register a new user with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123",
  "fullName": "John Doe"
}
```

**Validation:**
- `email`: Valid email format (required)
- `password`: Minimum 6 characters (required)
- `fullName`: Non-empty string (required)

**Response (201):**
```json
{
  "message": "Signup successful. Check your email for confirmation.",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "user_metadata": { "full_name": "John Doe" }
  },
  "session": {
    "access_token": "jwt_token",
    "refresh_token": "refresh_token",
    "expires_in": 3600,
    "token_type": "bearer"
  },
  "profile": {
    "id": 1,
    "authId": "uuid",
    "fullName": "John Doe",
    "email": "user@example.com",
    "phone": null,
    "address": null,
    "avatarUrl": null,
    "roleId": 1,
    "role": { "id": 1, "name": "CUSTOMER" },
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Errors:**
- 400: Validation failed
- 500: Internal server error

---

### POST /auth/login
Authenticate with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Validation:**
- `email`: Valid email format (required)
- `password`: Required

**Response (200):**
```json
{
  "message": "Login successful",
  "user": { ... },
  "session": { ... },
  "profile": { ... }
}
```

**Errors:**
- 400: Validation failed
- 401: Invalid credentials
- 500: Internal server error

---

### POST /auth/google
Sign in with Google OAuth.

**Request Body:**
```json
{
  "accessToken": "google_oauth_access_token"
}
```

**Validation:**
- `accessToken`: Required (Google OAuth access token)

**Response (200):**
```json
{
  "message": "Google sign-in successful",
  "user": { ... },
  "session": { ... },
  "profile": { ... }
}
```

**Errors:**
- 400: Validation failed (missing accessToken)
- 503: Google authentication not configured (missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET)
- 500: Internal server error

---

### POST /auth/apple
Sign in with Apple OAuth.

**Request Body:**
```json
{
  "identityToken": "apple_identity_token"
}
```

**Validation:**
- `identityToken`: Required (Apple identity token)

**Response (200):**
```json
{
  "message": "Apple sign-in successful",
  "user": { ... },
  "session": { ... },
  "profile": { ... }
}
```

**Errors:**
- 400: Validation failed (missing identityToken)
- 503: Apple authentication not configured (missing APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY)
- 500: Internal server error

---

### POST /auth/logout
Sign out the current user.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (200):**
```json
{
  "message": "Logged out successfully"
}
```

**Errors:**
- 500: Internal server error

---

### POST /auth/refresh
Refresh the access token using a refresh token.

**Request Body:**
```json
{
  "refreshToken": "refresh_token_from_login"
}
```

**Validation:**
- `refreshToken`: Required

**Response (200):**
```json
{
  "message": "Session refreshed",
  "session": {
    "access_token": "new_jwt_token",
    "refresh_token": "new_refresh_token",
    "expires_in": 3600,
    "token_type": "bearer"
  },
  "user": { ... }
}
```

**Errors:**
- 400: Validation failed
- 401: Invalid or expired refresh token
- 500: Internal server error

---

### POST /auth/forgot-password
Request a password reset email.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Validation:**
- `email`: Valid email format (required)

**Response (200):**
```json
{
  "message": "Password reset email sent"
}
```

**Errors:**
- 400: Validation failed
- 500: Internal server error

---

### POST /auth/reset-password
Reset password using a reset token.

**Request Body:**
```json
{
  "accessToken": "reset_token_from_email",
  "newPassword": "newsecurepassword123"
}
```

**Validation:**
- `accessToken`: Required
- `newPassword`: Minimum 6 characters (required)

**Response (200):**
```json
{
  "message": "Password reset successful"
}
```

**Errors:**
- 400: Validation failed
- 401: Invalid or expired reset token
- 500: Internal server error

---

### GET /auth/me
Get current authenticated user's profile.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (200):**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "CUSTOMER"
  },
  "profile": {
    "id": 1,
    "authId": "uuid",
    "fullName": "John Doe",
    "email": "user@example.com",
    "phone": "+1234567890",
    "address": "123 Main St",
    "avatarUrl": "https://example.com/avatar.jpg",
    "roleId": 1,
    "role": { "id": 1, "name": "CUSTOMER" },
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Errors:**
- 401: Unauthorized (missing/invalid token, profile not found)
- 500: Internal server error

---

### POST /auth/complete-profile
Complete user profile with role and contact info.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "role": "CUSTOMER",
  "phone": "+1234567890",
  "address": "123 Main St",
  "avatarUrl": "https://example.com/avatar.jpg"
}
```

**Validation:**
- `role`: Must be "CUSTOMER" or "ARTISAN" (required)
- `phone`: String (required)
- `address`: Optional string
- `avatarUrl`: Optional string (URL)

**Response (200):**
```json
{
  "message": "Profile completed",
  "profile": { ... }
}
```

**Errors:**
- 400: Validation failed
- 401: Unauthorized
- 404: Role not found
- 500: Internal server error

---

## Booking Endpoints

### POST /api/bookings/instant
Create an instant booking request (broadcast to all artisans).

**Headers:**
```
Authorization: Bearer <access_token>
```

**Required Role:** CUSTOMER

**Request Body:**
```json
{
  "serviceId": 1,
  "scheduledAt": "2024-01-20T10:00:00.000Z",
  "location": {
    "lat": 40.7128,
    "lng": -74.0060
  }
}
```

**Validation:**
- `serviceId`: Integer (required)
- `scheduledAt`: ISO 8601 datetime (required)
- `location`: Object with `lat` and `lng` as numbers (required)
  - `lat`: Between -90 and 90
  - `lng`: Between -180 and 180

**Response (201):**
```json
{
  "message": "Booking request created and dispatched",
  "booking": {
    "id": 1,
    "customer_id": 1,
    "artisan_id": null,
    "service_id": 1,
    "booking_type": "INSTANT",
    "status": "BROADCAST",
    "scheduled_at": "2024-01-20T10:00:00.000Z",
    "location": "0101000020E6100000...",  // PostGIS binary
    "created_at": "2024-01-15T10:30:00.000Z",
    "updated_at": "2024-01-15T10:30:00.000Z"
  }
}
```

**Errors:**
- 400: Validation failed (missing fields, invalid coordinates)
- 401: Unauthorized
- 403: Only customers can create booking requests
- 500: Internal server error

---

### POST /api/bookings/quote
Create a quote booking request (assigned to specific artisan).

**Headers:**
```
Authorization: Bearer <access_token>
```

**Required Role:** CUSTOMER

**Request Body:**
```json
{
  "artisanId": 2,
  "serviceId": 1,
  "scheduledAt": "2024-01-20T10:00:00.000Z",
  "location": {
    "lat": 40.7128,
    "lng": -74.0060
  }
}
```

**Validation:**
- `artisanId`: Integer (required)
- `serviceId`: Integer (required)
- `scheduledAt`: ISO 8601 datetime (required)
- `location`: Object with `lat` and `lng` as numbers (required)
  - `lat`: Between -90 and 90
  - `lng`: Between -180 and 180

**Response (201):**
```json
{
  "message": "Quote booking created",
  "booking": {
    "id": 2,
    "customer_id": 1,
    "artisan_id": 2,
    "service_id": 1,
    "booking_type": "QUOTE",
    "status": "ASSIGNED",
    "scheduled_at": "2024-01-20T10:00:00.000Z",
    "location": "0101000020E6100000...",
    "created_at": "2024-01-15T10:30:00.000Z",
    "updated_at": "2024-01-15T10:30:00.000Z"
  }
}
```

**Errors:**
- 400: Validation failed
- 401: Unauthorized
- 403: Only customers can create booking requests
- 500: Internal server error

---

## WebSocket Events

### Connection
```javascript
const socket = io('http://localhost:3000');
```

### Client Events

#### join:artisan
Join as an artisan to receive booking dispatches and quote assignments.

**Payload:**
```javascript
socket.emit('join:artisan', artisanId);  // artisanId: number
```

**Behavior:**
- Joins room `artisan:{artisanId}` for direct quote assignments
- Joins room `artisans` for broadcast dispatches

#### join:customer
Join as a customer for notifications.

**Payload:**
```javascript
socket.emit('join:customer', customerId);  // customerId: number
```

**Behavior:**
- Joins room `customer:{customerId}`

### Server Events

#### DISPATCH_BROADCAST
Emitted when an instant booking is created. Broadcast to all artisans in the `artisans` room.

**Payload:**
```json
{
  "type": "INSTANT_BOOKING",
  "bookingId": 1,
  "customerId": 1,
  "serviceId": 1,
  "scheduledAt": "2024-01-20T10:00:00.000Z",
  "location": { "lat": 40.7128, "lng": -74.0060 },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### QUOTE_ASSIGNED
Emitted when a quote booking is created. Sent to the specific artisan.

**Payload:**
```json
{
  "type": "QUOTE_BOOKING",
  "bookingId": 2,
  "customerId": 1,
  "artisanId": 2,
  "serviceId": 1,
  "scheduledAt": "2024-01-20T10:00:00.000Z",
  "location": { "lat": 40.7128, "lng": -74.0060 },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

## Error Response Format

All errors follow this structure:
```json
{
  "error": "Error message",
  "details": [...]  // Optional validation details
}
```

Or for OAuth configuration errors:
```json
{
  "error": "Google authentication is not configured...",
  "code": "OAUTH_NOT_CONFIGURED"
}
```

### Common Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (invalid/missing token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error
- `503` - Service Unavailable (OAuth not configured)

---

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 3000) | No |
| `NODE_ENV` | Environment (development/production) | No |
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (for admin operations) | Yes |
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `DIRECT_URL` | Direct PostgreSQL connection for migrations | Yes |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | Yes |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | No* |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | No* |
| `APPLE_CLIENT_ID` | Apple OAuth client ID | No* |
| `APPLE_TEAM_ID` | Apple Developer Team ID | No* |
| `APPLE_KEY_ID` | Apple Key ID | No* |
| `APPLE_PRIVATE_KEY` | Apple Private Key (PKCS#8 format) | No* |
| `CLIENT_URL` | Frontend URL for password reset redirects | Yes |
| `CORS_ORIGIN` | Allowed CORS origin | No |
| `DATABASE_LOG_QUERIES` | Enable Prisma query logging (true/false) | No |

*OAuth credentials are optional - endpoints will return 503 if not configured

---

## Database Schema

### Roles
- `CUSTOMER` - End users requesting services
- `ARTISAN` - Service providers

### Key Models
- **Profile** - User profile linked to Supabase auth
- **Service** - Services offered by artisans
- **Booking** - Service bookings (INSTANT or QUOTE type)
- **BookingStatusHistory** - Audit trail of status changes
- **Notification** - User notifications

### Booking Statuses
- `BROADCAST` - Instant booking, waiting for artisan
- `ASSIGNED` - Quote booking or instant booking accepted
- `IN_PROGRESS` - Service in progress
- `COMPLETED` - Service completed
- `CANCELLED` - Booking cancelled

### Booking Types
- `INSTANT` - Broadcast to all artisans
- `QUOTE` - Direct to specific artisan