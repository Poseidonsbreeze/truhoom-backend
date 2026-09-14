const { Router } = require('express');
const { prisma } = require('../config/database');
const { requireAuth } = require('../middlewares/auth');

const router = Router();
router.use(requireAuth());
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

const include = {
  customer: { select: { id: true, fullName: true, avatarUrl: true } },
  artisan: { select: { id: true, fullName: true, avatarUrl: true, profession: true } },
  service: true,
  statusHistory: { orderBy: { changedAt: 'asc' } },
  review: { select: { id: true, rating: true } },
  conversation: { select: { id: true } },
};

function visibleWhere(user) {
  return user.role === 'CUSTOMER'
    ? { customerId: user.profileId }
    : { OR: [{ artisanId: user.profileId }, { artisanId: null, status: 'BROADCAST', service: { artisanId: user.profileId }, declines: { none: { artisanId: user.profileId } } }] };
}

router.get('/', wrap(async (req, res) => {
  const allowed = ['BROADCAST', 'QUOTE_REQUESTED', 'QUOTE_OFFERED', 'QUOTE_DECLINED', 'ASSIGNED', 'IN_PROGRESS', 'AWAITING_COMPLETION_CONFIRMATION', 'COMPLETED', 'CANCELLED'];
  const status = req.query.status ? String(req.query.status).toUpperCase() : null;
  if (status && !allowed.includes(status)) throw fail('Invalid booking status.');
  res.json(await prisma.booking.findMany({
    where: { ...visibleWhere(req.user), ...(status ? { status } : {}) },
    include,
    orderBy: { scheduledAt: 'desc' },
    take: 100,
  }));
}));

router.get('/dashboard', wrap(async (req, res) => {
  if (req.user.role !== 'ARTISAN') throw fail('Artisan access required.', 403);
  const [quoteRequests, newJobs, activeJobs, completedJobs, unreadMessages, unreadNotifications] = await Promise.all([
    prisma.booking.count({ where: { artisanId: req.user.profileId, bookingType: 'QUOTE', status: { in: ['QUOTE_REQUESTED', 'QUOTE_OFFERED'] } } }),
    prisma.booking.count({ where: { status: 'BROADCAST', artisanId: null, service: { artisanId: req.user.profileId }, declines: { none: { artisanId: req.user.profileId } } } }),
    prisma.booking.count({ where: { artisanId: req.user.profileId, status: { in: ['ASSIGNED', 'IN_PROGRESS', 'AWAITING_COMPLETION_CONFIRMATION'] } } }),
    prisma.booking.count({ where: { artisanId: req.user.profileId, status: 'COMPLETED' } }),
    prisma.message.count({ where: { conversation: { artisanId: req.user.profileId }, senderId: { not: req.user.profileId }, readAt: null } }),
    prisma.notification.count({ where: { profileId: req.user.profileId, read: false } }),
  ]);
  res.json({ quoteRequests, newJobs, activeJobs, completedJobs, unreadMessages, unreadNotifications });
}));

router.get('/:id', wrap(async (req, res) => {
  const booking = await prisma.booking.findFirst({ where: { id: Number(req.params.id) || 0, ...visibleWhere(req.user) }, include });
  if (!booking) throw fail('Booking not found.', 404);
  res.json(booking);
}));

router.patch('/:id/quote', wrap(async (req, res) => {
  if (req.user.role !== 'ARTISAN') throw fail('Artisan access required.', 403);
  const id = Number(req.params.id) || 0;
  const amount = Number(req.body.amount);
  const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000 || !message || message.length > 2000) throw fail('Provide a valid quote amount and message.');
  const booking = await prisma.$transaction(async (db) => {
    const current = await db.booking.findFirst({ where: { id, artisanId: req.user.profileId, bookingType: 'QUOTE', status: { in: ['QUOTE_REQUESTED', 'QUOTE_OFFERED'] } } });
    if (!current) throw fail('Quote request not found or no longer negotiable.', 409);
    const updated = await db.booking.update({ where: { id }, data: { status: 'QUOTE_OFFERED', quotedPrice: amount, quoteMessage: message, quotedAt: new Date(), statusHistory: { create: { status: 'QUOTE_OFFERED' } } }, include });
    await db.notification.create({ data: { profileId: current.customerId, title: 'Quote received', body: `The artisan proposed ₦${amount.toLocaleString()} for booking #${id}.` } });
    return updated;
  });
  req.app.get('io')?.to(`profile:${booking.customerId}`).to(`profile:${booking.artisanId}`).emit('booking:updated', booking);
  req.app.get('io')?.to(`profile:${booking.customerId}`).emit('notification:created', { title: 'Quote received', body: `The artisan proposed ₦${Number(booking.quotedPrice).toLocaleString()} for booking #${booking.id}.` });
  res.json(booking);
}));

router.patch('/:id/quote-response', wrap(async (req, res) => {
  if (req.user.role !== 'CUSTOMER') throw fail('Customer access required.', 403);
  const id = Number(req.params.id) || 0;
  const action = String(req.body.action || '').toLowerCase();
  if (!['accept', 'decline'].includes(action)) throw fail('Choose accept or decline.');
  const nextStatus = action === 'accept' ? 'ASSIGNED' : 'QUOTE_DECLINED';
  const booking = await prisma.$transaction(async (db) => {
    const current = await db.booking.findFirst({ where: { id, customerId: req.user.profileId, bookingType: 'QUOTE', status: 'QUOTE_OFFERED', quotedPrice: { not: null } } });
    if (!current) throw fail('This quote is no longer available.', 409);
    const updated = await db.booking.update({ where: { id }, data: { status: nextStatus, statusHistory: { create: { status: nextStatus } } }, include });
    await db.notification.create({ data: { profileId: current.artisanId, title: action === 'accept' ? 'Quote accepted' : 'Quote declined', body: `Your quote for booking #${id} was ${action}ed.` } });
    return updated;
  });
  req.app.get('io')?.to(`profile:${booking.customerId}`).to(`profile:${booking.artisanId}`).emit('booking:updated', booking);
  req.app.get('io')?.to(`profile:${booking.artisanId}`).emit('notification:created', { title: action === 'accept' ? 'Quote accepted' : 'Quote declined', body: `Your quote for booking #${booking.id} was ${action}ed.` });
  res.json(booking);
}));

router.patch('/:id/status', wrap(async (req, res) => {
  const id = Number(req.params.id) || 0;
  const action = String(req.body.action || '').toLowerCase();
  const result = await prisma.$transaction(async (db) => {
    const booking = await db.booking.findUnique({ where: { id }, include: { service: true } });
    if (!booking) throw fail('Booking not found.', 404);
    let nextStatus;
    let artisanId = booking.artisanId;
    const statusData = {};
    if (req.user.role === 'CUSTOMER') {
      if (booking.customerId !== req.user.profileId) throw fail('Booking not found.', 404);
      if (action === 'confirm-completion' && booking.status === 'AWAITING_COMPLETION_CONFIRMATION' && booking.artisanCompletedAt) {
        nextStatus = 'COMPLETED'; statusData.customerCompletedAt = new Date();
      } else if (action === 'cancel' && ['BROADCAST', 'QUOTE_REQUESTED', 'QUOTE_OFFERED', 'ASSIGNED'].includes(booking.status)) {
        nextStatus = 'CANCELLED';
      } else throw fail('This booking action is not available.', 409);
    } else if (action === 'accept') {
      if (booking.service.artisanId !== req.user.profileId || booking.status !== 'BROADCAST' || booking.artisanId) throw fail('This job is no longer available.', 409);
      nextStatus = 'ASSIGNED'; artisanId = req.user.profileId;
    } else if (action === 'decline') {
      if (booking.bookingType === 'QUOTE' && booking.artisanId === req.user.profileId && ['QUOTE_REQUESTED', 'QUOTE_OFFERED'].includes(booking.status)) {
        nextStatus = 'QUOTE_DECLINED';
      } else {
        if (booking.service.artisanId !== req.user.profileId || booking.status !== 'BROADCAST') throw fail('This job cannot be declined.', 409);
        await db.bookingDecline.upsert({ where: { bookingId_artisanId: { bookingId: id, artisanId: req.user.profileId } }, update: {}, create: { bookingId: id, artisanId: req.user.profileId } });
        return { declined: true };
      }
    } else {
      if (booking.artisanId !== req.user.profileId) throw fail('Booking not found.', 404);
      const transitions = { start: ['ASSIGNED', 'IN_PROGRESS'], complete: ['IN_PROGRESS', 'AWAITING_COMPLETION_CONFIRMATION'], cancel: ['ASSIGNED', 'CANCELLED'] };
      const transition = transitions[action];
      if (!transition || booking.status !== transition[0]) throw fail('Invalid booking status transition.', 409);
      if (action === 'start' && booking.paymentStatus !== 'PAID') throw fail('Customer payment must be verified before work starts.', 409);
      nextStatus = transition[1];
      if (action === 'complete') statusData.artisanCompletedAt = new Date();
    }
    const updated = await db.booking.updateMany({ where: { id, status: booking.status, artisanId: booking.artisanId }, data: { status: nextStatus, artisanId, ...statusData } });
    if (!updated.count) throw fail('Booking was updated by someone else.', 409);
    await db.bookingStatusHistory.create({ data: { bookingId: id, status: nextStatus } });
    const recipientId = req.user.role === 'CUSTOMER' ? artisanId : booking.customerId;
    if (recipientId) await db.notification.create({ data: { profileId: recipientId, title: `Booking ${nextStatus.toLowerCase().replace('_', ' ')}`, body: `Booking #${id} status changed.` } });
    return db.booking.findUnique({ where: { id }, include });
  });
  if (!result.declined) req.app.get('io')?.to(`profile:${result.customerId}`).to(result.artisanId ? `profile:${result.artisanId}` : '').emit('booking:updated', result);
  if (!result.declined) {
    const recipientId = req.user.role === 'CUSTOMER' ? result.artisanId : result.customerId;
    if (recipientId) req.app.get('io')?.to(`profile:${recipientId}`).emit('notification:created', { title: `Booking ${result.status.toLowerCase().replace('_', ' ')}`, body: `Booking #${result.id} status changed.` });
  }
  if (result.status === 'COMPLETED') require('./payments').releasePayout(result.id).catch(console.error);
  res.json(result);
}));

router.post('/:id/review', wrap(async (req, res) => {
  const bookingId = Number(req.params.id) || 0;
  const rating = Number(req.body.rating);
  const comment = typeof req.body.comment === 'string' ? req.body.comment.trim() : '';
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !comment || comment.length > 2000) throw fail('Provide a rating from 1 to 5 and a comment.');
  const review = await prisma.$transaction(async (db) => {
    const booking = await db.booking.findFirst({ where: { id: bookingId, customerId: req.user.profileId, status: 'COMPLETED', artisanId: { not: null } }, include: { service: true } });
    if (!booking) throw fail('Only the customer can review a completed booking.', 403);
    try {
      const created = await db.review.create({ data: { bookingId, artisanId: booking.artisanId, authorId: req.user.profileId, rating, comment, service: booking.service.name } });
      await db.notification.create({ data: { profileId: booking.artisanId, title: 'New review', body: `You received a ${rating}-star review.` } });
      return created;
    } catch (error) {
      if (error.code === 'P2002') throw fail('This booking has already been reviewed.', 409);
      throw error;
    }
  });
  req.app.get('io')?.to(`profile:${review.artisanId}`).emit('notification:created', { title: 'New review', body: `You received a ${review.rating}-star review.` });
  res.status(201).json(review);
}));

module.exports = router;
