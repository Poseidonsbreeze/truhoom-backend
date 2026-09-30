const { prisma } = require('../config/database');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
async function createBooking(customerId, body, quote) {
  const { serviceId, addressId, artisanId, scheduledAt, notes = '' } = body;
  const customerBudget = quote ? Number(body.customerBudget) : null;
  if (!Number.isInteger(serviceId) || !Number.isInteger(addressId)) throw fail('Select a service and a saved address.');
  if (quote && !Number.isInteger(artisanId)) throw fail('Select an artisan.');
  if (quote && (!Number.isFinite(customerBudget) || customerBudget <= 0 || customerBudget > 100000000)) throw fail('Enter a valid price you want to pay.');
  const date = new Date(scheduledAt);
  if (!Number.isFinite(date.getTime()) || date <= new Date()) throw fail('Choose a future date and time.');
  if (typeof notes !== 'string' || notes.length > 4000) throw fail('Notes must be at most 4000 characters.');
  return prisma.$transaction(async db => {
    const address = await db.savedAddress.findFirst({ where: { id: addressId, profileId: customerId } });
    if (!address) throw fail('Saved address not found.', 404);
    const service = await db.service.findFirst({ where: { id: serviceId, isActive: true, artisan: { role: { name: 'ARTISAN' } } } });
    if (!service) throw fail('Service is no longer available.', 404);
    if (quote && service.artisanId !== artisanId) throw fail('This service does not belong to the selected artisan.');
    const status = quote ? 'QUOTE_REQUESTED' : 'BROADCAST';
    const booking = await db.booking.create({ data: {
      customerId, serviceId, artisanId: quote ? artisanId : null, bookingType: quote ? 'QUOTE' : 'INSTANT', status,
      scheduledAt: date, latitude: address.lat, longitude: address.lng, address: address.address, notes: notes.trim(), customerBudget,
      statusHistory: { create: { status } },
    } });
    await db.notification.create({ data: {
      profileId: service.artisanId,
      title: quote ? 'New quote request' : 'New booking request',
      body: quote ? `Customer offered ₦${customerBudget.toLocaleString()} for ${service.name}.` : `${service.name} is scheduled for ${date.toISOString()}.`,
    } });
    return booking;
  });
}
const BookingService = {
  createInstantRequest: (id, body) => createBooking(id, body, false),
  createQuoteRequest: (id, body) => createBooking(id, body, true),
};
function controller(quote) {
  return async (req, res, next) => {
    try {
      if (req.user.role !== 'CUSTOMER') throw fail('Only customers can create bookings.',403);
      const booking = await createBooking(req.user.profileId, req.body, quote);
      const service = await prisma.service.findUnique({ where: { id: booking.serviceId } });
      req.app.get('io')?.to(`artisan:${service.artisanId}`).emit(quote ? 'QUOTE_ASSIGNED' : 'DISPATCH_BROADCAST', { bookingId: booking.id });
      req.app.get('io')?.to(`profile:${service.artisanId}`).emit('notification:created', {
        title: quote ? 'New quote request' : 'New booking request',
        body: quote ? `Customer offered ₦${Number(booking.customerBudget).toLocaleString()} for ${service.name}.` : `${service.name} has a new booking request.`,
      });
      res.status(201).json({ message: quote ? 'Quote request sent.' : 'Booking request sent.', booking });
    } catch (error) { next(error); }
  };
}
module.exports = { BookingService, createInstantRequestController: controller(false), createQuoteRequestController: controller(true) };
