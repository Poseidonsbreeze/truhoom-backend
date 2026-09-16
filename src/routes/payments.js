const { Router } = require('express');
const { prisma } = require('../config/database');
const { requireAuth } = require('../middlewares/auth');
const paystack = require('../services/paystack');
const router = Router();
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const feeRate = () => {
  const value = Number(process.env.PLATFORM_FEE_PERCENT || 10);
  if (!Number.isFinite(value) || value < 0 || value > 50) throw fail('Invalid platform fee configuration.', 500);
  return value;
};
const amountFor = (booking) => Number(booking.bookingType === 'QUOTE' ? booking.quotedPrice : booking.service.price);

async function recordPayment(reference, transaction) {
  const booking = await prisma.booking.findUnique({ where: { paymentReference: reference }, include: { service: true } });
  if (!booking) return null;
  const expectedKobo = Math.round(Number(booking.paymentAmount) * 100);
  const requestedKobo = Number(transaction.requested_amount ?? transaction.amount);
  const chargedKobo = Number(transaction.amount);
  if (transaction.status !== 'success' || transaction.currency !== 'NGN' || requestedKobo !== expectedKobo || chargedKobo < expectedKobo || transaction.reference !== reference) throw fail('Payment verification did not match this booking.', 409);
  if (booking.paymentStatus === 'PAID') return booking;
  const fee = Math.round(Number(booking.paymentAmount) * feeRate()) / 100;
  return prisma.booking.update({ where: { id: booking.id }, data: { paymentStatus: 'PAID', paidAt: new Date(transaction.paid_at || Date.now()), platformFee: fee, artisanNet: Number(booking.paymentAmount) - fee } });
}

async function releasePayout(bookingId) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { artisan: { include: { payoutMethods: { where: { isDefault: true, provider: 'Paystack' }, take: 1 } } } } });
  if (!booking || booking.status !== 'COMPLETED' || booking.paymentStatus !== 'PAID' || !booking.artisanNet || !['NOT_READY', 'READY', 'FAILED'].includes(booking.payoutStatus)) return null;
  const recipient = booking.artisan?.payoutMethods[0]?.recipientToken;
  if (!recipient) return prisma.booking.update({ where: { id: booking.id }, data: { payoutStatus: 'READY' } });
  const reference = paystack.reference('truhoom-payout', booking.id);
  await prisma.booking.update({ where: { id: booking.id }, data: { payoutStatus: 'PROCESSING', payoutReference: reference } });
  try {
    const transfer = await paystack.transfer({ amountKobo: Math.round(Number(booking.artisanNet) * 100), recipient, reference, reason: `Truhoom payout for booking #${booking.id}` });
    return prisma.booking.update({ where: { id: booking.id }, data: { payoutTransferCode: transfer.transfer_code, payoutStatus: transfer.status === 'success' ? 'PAID' : 'PROCESSING', ...(transfer.status === 'success' ? { paidOutAt: new Date() } : {}) } });
  } catch (error) {
    await prisma.booking.update({ where: { id: booking.id }, data: { payoutStatus: 'FAILED' } });
    return null;
  }
}

router.post('/webhook', wrap(async (req, res) => {
  if (!paystack.validWebhook(req.rawBody, req.headers['x-paystack-signature'])) return res.sendStatus(401);
  const event = req.body;
  res.sendStatus(200);
  if (event.event === 'charge.success') recordPayment(event.data.reference, event.data).catch(console.error);
  if (['transfer.success', 'transfer.failed', 'transfer.reversed'].includes(event.event)) {
    prisma.booking.updateMany({ where: { payoutReference: event.data.reference }, data: { payoutStatus: event.event === 'transfer.success' ? 'PAID' : 'FAILED', ...(event.event === 'transfer.success' ? { paidOutAt: new Date() } : {}) } }).catch(console.error);
  }
}));

router.post('/bookings/:id/initialize', requireAuth(['CUSTOMER']), wrap(async (req, res) => {
  const booking = await prisma.booking.findFirst({ where: { id: Number(req.params.id) || 0, customerId: req.user.profileId, status: 'ASSIGNED' }, include: { service: true, customer: { select: { email: true } } } });
  if (!booking) throw fail('Assigned booking not found.', 404);
  if (booking.paymentStatus === 'PAID') throw fail('This booking is already paid.', 409);
  const amount = amountFor(booking);
  if (!Number.isFinite(amount) || amount <= 0) throw fail('This booking has no valid agreed price.', 409);
  const reference = paystack.reference('truhoom-pay', booking.id);
  const callbackUrl = process.env.PAYSTACK_CALLBACK_URL || 'https://truhoom.app/payment-return';
  const data = await paystack.initialize({ email: booking.customer.email, amountKobo: Math.round(amount * 100), reference, metadata: { bookingId: booking.id, customerId: booking.customerId }, callbackUrl });
  await prisma.booking.update({ where: { id: booking.id }, data: { paymentStatus: 'PENDING', paymentReference: reference, paymentAmount: amount } });
  res.json({ authorizationUrl: data.authorization_url, callbackUrl, reference, amount });
}));

router.post('/bookings/:id/verify', requireAuth(['CUSTOMER']), wrap(async (req, res) => {
  const booking = await prisma.booking.findFirst({ where: { id: Number(req.params.id) || 0, customerId: req.user.profileId }, select: { paymentReference: true } });
  if (!booking?.paymentReference) throw fail('Payment has not been initialized.', 409);
  const paid = await recordPayment(booking.paymentReference, await paystack.verify(booking.paymentReference));
  if (!paid) throw fail('Payment booking not found.', 404);
  req.app.get('io')?.to(`profile:${paid.customerId}`).to(`profile:${paid.artisanId}`).emit('booking:updated', paid);
  res.json(paid);
}));

router.get('/bookings/:id', requireAuth(), wrap(async (req, res) => {
  const booking = await prisma.booking.findFirst({ where: { id: Number(req.params.id) || 0, OR: [{ customerId: req.user.profileId }, { artisanId: req.user.profileId }] }, select: { id: true, paymentStatus: true, paymentAmount: true, platformFee: true, artisanNet: true, paidAt: true, payoutStatus: true, paidOutAt: true } });
  if (!booking) throw fail('Booking not found.', 404);
  if (req.user.role === 'CUSTOMER') { delete booking.artisanNet; delete booking.platformFee; }
  res.json(booking);
}));

module.exports = { router, recordPayment, releasePayout };
