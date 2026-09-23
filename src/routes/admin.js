const { Router } = require('express');
const { prisma } = require('../config/database');
const { requireAuth } = require('../middlewares/auth');
const { releasePayout } = require('./payments');

const router = Router();
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
router.use(requireAuth(['ADMIN']));

const money = (value) => Number(value || 0);

router.get('/dashboard', wrap(async (req, res) => {
  const [users, artisans, bookings, completed, paid, pendingPayouts, paymentTotals, paidOutTotals, recentBookings, payouts] = await Promise.all([
    prisma.profile.count(),
    prisma.profile.count({ where: { role: { name: 'ARTISAN' } } }),
    prisma.booking.count(),
    prisma.booking.count({ where: { status: 'COMPLETED' } }),
    prisma.booking.count({ where: { paymentStatus: 'PAID' } }),
    prisma.booking.count({ where: { paymentStatus: 'PAID', payoutStatus: { in: ['READY', 'PROCESSING', 'FAILED'] } } }),
    prisma.booking.aggregate({ where: { paymentStatus: 'PAID' }, _sum: { paymentAmount: true, platformFee: true, artisanNet: true } }),
    prisma.booking.aggregate({ where: { payoutStatus: 'PAID' }, _sum: { artisanNet: true } }),
    prisma.booking.findMany({ orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, status: true, bookingType: true, paymentStatus: true, paymentAmount: true, payoutStatus: true, scheduledAt: true, customer: { select: { fullName: true } }, artisan: { select: { fullName: true } }, service: { select: { name: true } } } }),
    prisma.booking.findMany({ where: { paymentStatus: 'PAID' }, orderBy: { paidAt: 'desc' }, take: 50, select: { id: true, status: true, paymentAmount: true, platformFee: true, artisanNet: true, paidAt: true, payoutStatus: true, paidOutAt: true, artisan: { select: { id: true, fullName: true, payoutMethods: { where: { isDefault: true }, take: 1, select: { bankName: true, accountName: true, accountLast4: true } } } }, service: { select: { name: true } } } }),
  ]);
  res.json({
    summary: { users, artisans, bookings, completed, paid, pendingPayouts, grossPayments: money(paymentTotals._sum.paymentAmount), platformEarnings: money(paymentTotals._sum.platformFee), artisanLiability: money(paymentTotals._sum.artisanNet), paidOut: money(paidOutTotals._sum.artisanNet) },
    recentBookings,
    payouts,
  });
}));

router.post('/payouts/:bookingId/release', wrap(async (req, res) => {
  const bookingId = Number(req.params.bookingId);
  if (!Number.isInteger(bookingId) || bookingId < 1) throw fail('Invalid booking.', 400);
  const payout = await releasePayout(bookingId);
  if (!payout) throw fail('This payout is not ready for release.', 409);
  res.json({ id: payout.id, payoutStatus: payout.payoutStatus, payoutReference: payout.payoutReference, paidOutAt: payout.paidOutAt });
}));

module.exports = router;
