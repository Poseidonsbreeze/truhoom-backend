const { Router } = require('express');
const { prisma } = require('../config/database');
const { requireAuth } = require('../middlewares/auth');
const router = Router();
router.use(requireAuth());
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const member = (profileId) => ({ OR: [{ customerId: profileId }, { artisanId: profileId }] });
const publicCustomer = { id: true, fullName: true, avatarUrl: true };
const publicArtisan = { id: true, fullName: true, avatarUrl: true, profession: true };

router.get('/', wrap(async (req, res) => {
  const conversations = await prisma.conversation.findMany({
    where: member(req.user.profileId),
    include: {
      customer: { select: { id: true, fullName: true, avatarUrl: true } },
      artisan: { select: { id: true, fullName: true, avatarUrl: true, profession: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      _count: { select: { messages: { where: { senderId: { not: req.user.profileId }, readAt: null } } } },
    },
    orderBy: { updatedAt: 'desc' }, take: 100,
  });
  res.json(conversations.map((conversation) => ({ ...conversation, lastMessage: conversation.messages[0] || null, unreadCount: conversation._count.messages })));
}));

router.post('/', wrap(async (req, res) => {
  const otherId = Number(req.body.profileId);
  const other = await prisma.profile.findUnique({ where: { id: otherId }, include: { role: true } });
  if (!other || other.id === req.user.profileId || other.role.name === req.user.role) throw fail('Choose a valid customer/artisan conversation.');
  const customerId = req.user.role === 'CUSTOMER' ? req.user.profileId : other.id;
  const artisanId = req.user.role === 'ARTISAN' ? req.user.profileId : other.id;
  const conversation = await prisma.conversation.upsert({ where: { customerId_artisanId: { customerId, artisanId } }, update: {}, create: { customerId, artisanId }, include: { customer: { select: publicCustomer }, artisan: { select: publicArtisan } } });
  res.status(201).json(conversation);
}));

router.get('/:id', wrap(async (req, res) => {
  const id = Number(req.params.id) || 0;
  const conversation = await prisma.$transaction(async (db) => {
    const found = await db.conversation.findFirst({ where: { id, ...member(req.user.profileId) }, include: { customer: { select: publicCustomer }, artisan: { select: publicArtisan }, messages: { orderBy: { createdAt: 'asc' }, take: 500 } } });
    if (!found) throw fail('Conversation not found.', 404);
    await db.message.updateMany({ where: { conversationId: id, senderId: { not: req.user.profileId }, readAt: null }, data: { readAt: new Date() } });
    return found;
  });
  res.json(conversation);
}));

router.post('/:id/messages', wrap(async (req, res) => {
  const conversationId = Number(req.params.id) || 0;
  const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';
  if (!body || body.length > 4000) throw fail('Message must be between 1 and 4000 characters.');
  const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, ...member(req.user.profileId) } });
  if (!conversation) throw fail('Conversation not found.', 404);
  const offPlatform = /\b(whats?app|pay\s+(me\s+)?direct|outside\s+(the\s+)?app|cash\s+payment|bank\s+transfer)\b|(?:\+?234|0)\d{10}\b/i.test(body);
  if (offPlatform) {
    const protectedBooking = await prisma.booking.findFirst({ where: { customerId: conversation.customerId, artisanId: conversation.artisanId, paymentStatus: 'PAID', status: { notIn: ['CANCELLED', 'QUOTE_DECLINED'] } }, select: { id: true } });
    if (!protectedBooking) throw fail('For your safety, keep contact details and payment inside Truhoom until the booking payment is protected.', 400);
  }
  const message = await prisma.$transaction(async (db) => {
    const created = await db.message.create({ data: { conversationId, senderId: req.user.profileId, body } });
    await db.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
    const recipientId = conversation.customerId === req.user.profileId ? conversation.artisanId : conversation.customerId;
    await db.notification.create({ data: { profileId: recipientId, title: 'New message', body: body.slice(0, 140) } });
    return created;
  });
  const recipientId = conversation.customerId === req.user.profileId ? conversation.artisanId : conversation.customerId;
  req.app.get('io')?.to(`profile:${recipientId}`).to(`profile:${req.user.profileId}`).emit('message:created', message);
  req.app.get('io')?.to(`profile:${recipientId}`).emit('notification:created', { title: 'New message', body: body.slice(0, 140) });
  res.status(201).json(message);
}));

module.exports = router;
