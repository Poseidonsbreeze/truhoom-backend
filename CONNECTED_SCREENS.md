# Connected Home, profiles, booking requests, and map

The local PostgreSQL schema now includes saved addresses, reviews, profile availability and service areas, and booking notes/address snapshots. Apply using `npm run prisma:push` and `npm run prisma:generate` when setting up another checkout. Existing records are preserved; do not run the destructive sample seed to apply these changes.

## API

All routes require the local Bearer access token.

- `GET /api/account/profile`: own persisted profile.
- `PATCH /api/account/profile`: update name, phone, location, coordinates, bio, photo URL; artisans can also update profession, experience, skills, service areas, response-time description, and availability. Email, role, verification and identity are not editable through this route.
- `GET /api/account/addresses`: own saved addresses.
- `POST /api/account/addresses`: label, address, lat, lng. First address becomes default.
- `PATCH /api/account/addresses/:id/default`: select default and synchronize profile location.
- `DELETE /api/account/addresses/:id`: remove own address and choose a new default if needed.
- `GET /api/discovery/map-bookings`: artisan-only; active assigned bookings and broadcasts for services owned by that artisan. Does not expose other customers' profiles.
- Existing discovery routes now read profiles, active services and reviews from PostgreSQL. Ratings, review counts and completed jobs are calculated from records. No fabricated review/availability/distance fallbacks.

Booking POST bodies now use `{ serviceId, addressId, scheduledAt, notes }`; quotes also require `artisanId`. The server verifies address ownership, active service, matching artisan and a future date. Coordinates and the address are taken from the saved address, not arbitrary client-provided coordinates. Address and notes are stored with the booking, so deleting the saved address does not erase booking history.

## Frontend

Home and profile views reload on focus. Edit Profile saves to the API; photo URLs are supported (file upload is not implemented). Email is read-only. Saved Addresses can use device location or manually entered coordinates; selecting current location does not geocode the typed street address. Location permission is requested only after the user taps the action.

Map pins use stored coordinates and real OpenStreetMap tiles, with zoom, pan, recenter and attribution. A device location can be used temporarily as the search origin. Tiles need an internet connection. Profiles without coordinates remain in the list but have no pin. Customer maps show artisans; artisan maps show authorized active booking locations with persisted notes, schedule and address.

Profile settings links to payment methods, notifications, verification, messaging and other screens outside this change keep their existing behavior. Review writing and other job-management actions are separate work; empty review data is now shown honestly.

## Verification

`npm run test:screens` runs local PostgreSQL integration tests for profile persistence, ownership boundaries, address defaults/deletion, discovery statistics, booking notes/location snapshots, service validation and map visibility. It creates disposable accounts and deletes only those accounts and their test records. A web export verifies frontend bundling. Browser/device permission prompts and tile rendering should also be checked on the target device.
