const { Router } = require('express');
const { prisma } = require('../config/database');
const paystack = require('../services/paystack');

const router = Router();

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

router.get('/dashboard', wrap(async (req, res) => {
  const [
    grossPaymentsResult,
    platformEarningsResult,
    artisanLiabilityResult,
    paidOutResult,
    paidBookingsCount,
    pendingPayoutsCount,
    allBookingsCount,
    completedBookingsCount,
    usersCount,
    artisansCount,
    recentPayouts,
    recentBookings,
  ] = await Promise.all([
    prisma.booking.aggregate({
      where: { paymentStatus: 'PAID' },
      _sum: { paymentAmount: true },
    }),
    prisma.booking.aggregate({
      where: { paymentStatus: 'PAID' },
      _sum: { platformFee: true },
    }),
    prisma.booking.aggregate({
      where: { paymentStatus: 'PAID', payoutStatus: { not: 'PAID' } },
      _sum: { artisanNet: true },
    }),
    prisma.booking.aggregate({
      where: { payoutStatus: 'PAID' },
      _sum: { artisanNet: true },
    }),
    prisma.booking.count({ where: { paymentStatus: 'PAID' } }),
    prisma.booking.count({ where: { paymentStatus: 'PAID', payoutStatus: { in: ['NOT_READY', 'READY', 'PROCESSING', 'FAILED'] } } }),
    prisma.booking.count(),
    prisma.booking.count({ where: { status: 'COMPLETED' } }),
    prisma.profile.count({ where: { role: { name: 'CUSTOMER' } } }),
    prisma.profile.count({ where: { role: { name: 'ARTISAN' } } }),
    prisma.booking.findMany({
      where: { paymentStatus: 'PAID' },
      include: {
        artisan: { select: { id: true, fullName: true, payoutMethods: { where: { isDefault: true }, take: 1 } } },
        service: { select: { id: true, name: true } },
      },
      orderBy: { paidAt: 'desc' },
      take: 50,
    }),
    prisma.booking.findMany({
      include: {
        customer: { select: { id: true, fullName: true } },
        artisan: { select: { id: true, fullName: true } },
        service: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  const summary = {
    grossPayments: Number(grossPaymentsResult._sum.paymentAmount || 0),
    platformEarnings: Number(platformEarningsResult._sum.platformFee || 0),
    artisanLiability: Number(artisanLiabilityResult._sum.artisanNet || 0),
    paidOut: Number(paidOutResult._sum.artisanNet || 0),
    paid: paidBookingsCount,
    pendingPayouts: pendingPayoutsCount,
    bookings: allBookingsCount,
    completed: completedBookingsCount,
    users: usersCount,
    artisans: artisansCount,
  };

  const payouts = recentPayouts.map((booking) => ({
    id: booking.id,
    status: booking.status,
    paymentAmount: Number(booking.paymentAmount || 0),
    platformFee: Number(booking.platformFee || 0),
    artisanNet: Number(booking.artisanNet || 0),
    payoutStatus: booking.payoutStatus,
    paidAt: booking.paidAt,
    paidOutAt: booking.paidOutAt,
    artisan: booking.artisan,
    service: booking.service,
  }));

  const bookings = recentBookings.map((booking) => ({
    id: booking.id,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    paymentAmount: Number(booking.paymentAmount || 0),
    customer: booking.customer,
    artisan: booking.artisan,
    service: booking.service,
  }));

  res.json({ summary, payouts, recentBookings: bookings });
}));

router.post('/payouts/:id/release', wrap(async (req, res) => {
  const bookingId = Number(req.params.id);
  if (!Number.isInteger(bookingId) || bookingId <= 0) throw fail('Invalid booking ID.', 400);

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      artisan: { include: { payoutMethods: { where: { isDefault: true }, take: 1 } } },
      service: true,
    },
  });

  if (!booking) throw fail('Booking not found.', 404);
  if (booking.paymentStatus !== 'PAID') throw fail('Booking payment not verified.', 409);
  if (booking.status !== 'COMPLETED') throw fail('Booking not completed.', 409);
  if (!['NOT_READY', 'READY', 'FAILED'].includes(booking.payoutStatus)) {
    throw fail(`Payout cannot be released from status ${booking.payoutStatus}.`, 409);
  }
  const method = booking.artisan?.payoutMethods?.[0];
  if (!method) throw fail('Artisan has no default payout account.', 409);

  const transfer = await paystack.transfer({
    amountKobo: Math.round(Number(booking.artisanNet) * 100),
    recipient: method.recipientToken,
    reference: `payout_${booking.id}_${Date.now()}`,
    reason: `Payout for booking #${booking.id} - ${booking.service.name}`,
  });

  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      payoutStatus: 'PROCESSING',
      payoutReference: transfer.reference,
      payoutTransferCode: transfer.transfer_code,
    },
  });

  res.json({ message: 'Payout initiated', transfer });
}));

module.exports = router;