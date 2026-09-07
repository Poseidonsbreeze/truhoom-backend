const { prisma } = require('../config/database');

function validateCoordinates(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return { valid: false, error: 'lat and lng must be numbers' };
  }
  if (lat < -90 || lat > 90) {
    return { valid: false, error: 'lat must be between -90 and 90' };
  }
  if (lng < -180 || lng > 180) {
    return { valid: false, error: 'lng must be between -180 and 180' };
  }
  return { valid: true };
}

function validateLocation(location) {
  if (!location || typeof location !== 'object') {
    return { valid: false, error: 'location is required and must be an object' };
  }
  if (typeof location.lat !== 'number' || typeof location.lng !== 'number') {
    return { valid: false, error: 'location must contain lat and lng as numbers' };
  }
  return validateCoordinates(location.lat, location.lng);
}

class BookingService {
  static async createInstantRequest(customerId, { serviceId, scheduledAt, location }) {
    const coordCheck = validateCoordinates(location.lat, location.lng);
    if (!coordCheck.valid) {
      throw new Error(`Invalid coordinates: ${coordCheck.error}`);
    }

    const booking = await prisma.$transaction(async (tx) => {
      const [created] = await tx.$queryRaw`
        INSERT INTO bookings (
          customer_id,
          service_id,
          booking_type,
          status,
          scheduled_at,
          location
        )
        VALUES (
          ${customerId},
          ${serviceId},
          'INSTANT'::"BookingType",
          'BROADCAST'::"BookingStatus",
          ${new Date(scheduledAt)}::timestamptz,
          ST_SetSRID(ST_MakePoint(${location.lng}, ${location.lat}), 4326)
        )
        RETURNING id, customer_id, artisan_id, service_id, booking_type, status,
                  scheduled_at, created_at, updated_at,
                  ST_AsText(location) AS location;
      `;

      await tx.bookingStatusHistory.create({
        data: {
          bookingId: created.id,
          status: 'BROADCAST',
        },
      });

      return created;
    });

    return booking;
  }

  static async createQuoteRequest(customerId, { artisanId, serviceId, scheduledAt, location }) {
    const coordCheck = validateCoordinates(location.lat, location.lng);
    if (!coordCheck.valid) {
      throw new Error(`Invalid coordinates: ${coordCheck.error}`);
    }

    const booking = await prisma.$transaction(async (tx) => {
      const [created] = await tx.$queryRaw`
        INSERT INTO bookings (
          customer_id,
          artisan_id,
          service_id,
          booking_type,
          status,
          scheduled_at,
          location
        )
        VALUES (
          ${customerId},
          ${artisanId},
          ${serviceId},
          'QUOTE'::"BookingType",
          'ASSIGNED'::"BookingStatus",
          ${new Date(scheduledAt)}::timestamptz,
          ST_SetSRID(ST_MakePoint(${location.lng}, ${location.lat}), 4326)
        )
        RETURNING id, customer_id, artisan_id, service_id, booking_type, status,
                  scheduled_at, created_at, updated_at,
                  ST_AsText(location) AS location;
      `;

      await tx.bookingStatusHistory.create({
        data: {
          bookingId: created.id,
          status: 'ASSIGNED',
        },
      });

      return created;
    });

    return booking;
  }
}

function getIO(req) {
  return req.app.get('io');
}

async function createInstantRequestController(req, res, next) {
  try {
    const customerId = req.user.profileId;

    if (req.user.role !== 'CUSTOMER') {
      return res.status(403).json({ error: 'Only customers can create booking requests' });
    }

    const { serviceId, scheduledAt, location } = req.body;

    if (!serviceId || !scheduledAt || !location) {
      return res.status(400).json({
        error: 'Missing required fields: serviceId, scheduledAt, location',
      });
    }

    const locationValidation = validateLocation(location);
    if (!locationValidation.valid) {
      return res.status(400).json({ error: locationValidation.error });
    }

    const booking = await BookingService.createInstantRequest(customerId, {
      serviceId,
      scheduledAt,
      location,
    });

    const io = getIO(req);
    if (io) {
      io.to('artisans').emit('DISPATCH_BROADCAST', {
        type: 'INSTANT_BOOKING',
        bookingId: booking.id,
        customerId,
        serviceId,
        scheduledAt: booking.scheduled_at,
        location,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(201).json({
      message: 'Booking request created and dispatched',
      booking,
    });
  } catch (err) {
    next(err);
  }
}

async function createQuoteRequestController(req, res, next) {
  try {
    const customerId = req.user.profileId;

    if (req.user.role !== 'CUSTOMER') {
      return res.status(403).json({ error: 'Only customers can create booking requests' });
    }

    const { artisanId, serviceId, scheduledAt, location } = req.body;

    if (!artisanId || !serviceId || !scheduledAt || !location) {
      return res.status(400).json({
        error: 'Missing required fields: artisanId, serviceId, scheduledAt, location',
      });
    }

    const locationValidation = validateLocation(location);
    if (!locationValidation.valid) {
      return res.status(400).json({ error: locationValidation.error });
    }

    const booking = await BookingService.createQuoteRequest(customerId, {
      artisanId,
      serviceId,
      scheduledAt,
      location,
    });

    const io = getIO(req);
    if (io) {
      io.to(`artisan:${artisanId}`).emit('QUOTE_ASSIGNED', {
        type: 'QUOTE_BOOKING',
        bookingId: booking.id,
        customerId,
        artisanId,
        serviceId,
        scheduledAt: booking.scheduled_at,
        location,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(201).json({
      message: 'Quote booking created',
      booking,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createInstantRequestController,
  createQuoteRequestController,
  BookingService,
};