const { Router } = require('express');
const { prisma } = require('../config/database');
const { requireAuth } = require('../middlewares/auth');
const paystack = require('../services/paystack');
const router = Router();
router.use(requireAuth());
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const artisanOnly = (req) => { if (req.user.role !== 'ARTISAN') throw fail('Artisan access required.', 403); };
const id = (value) => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : 0;
const validToken = (value) => typeof value === 'string' && /^[A-Za-z0-9_.:-]{12,500}$/.test(value);

router.get('/notifications', wrap(async (req, res) => {
  res.json(await prisma.notification.findMany({ where: { profileId: req.user.profileId }, orderBy: { createdAt: 'desc' }, take: 100 }));
}));
router.patch('/notifications/read-all', wrap(async (req, res) => {
  const result = await prisma.notification.updateMany({ where: { profileId: req.user.profileId, read: false }, data: { read: true } });
  res.json({ updated: result.count });
}));
router.patch('/notifications/:id/read', wrap(async (req, res) => {
  const result = await prisma.notification.updateMany({ where: { id: id(req.params.id), profileId: req.user.profileId }, data: { read: true } });
  if (!result.count) throw fail('Notification not found.', 404);
  res.json({ updated: 1 });
}));
router.get('/payout-banks', wrap(async (req, res) => {
  artisanOnly(req);
  const banks = await paystack.listBanks();
  res.json(banks.map((bank) => ({ id: bank.id, name: bank.name, code: bank.code })).sort((a, b) => a.name.localeCompare(b.name)));
}));

function methodRoutes(kind) {
  const payment = kind === 'payment';
  const base = `/${kind}-methods`;
  const model = payment ? prisma.paymentMethod : prisma.payoutMethod;
  const safeSelect = payment
    ? { id: true, provider: true, brand: true, last4: true, expiryMonth: true, expiryYear: true, isDefault: true, createdAt: true }
    : { id: true, provider: true, bankName: true, accountName: true, accountLast4: true, isDefault: true, createdAt: true };
  router.get(base, wrap(async (req, res) => {
    if (!payment) artisanOnly(req);
    res.json(await model.findMany({ where: { profileId: req.user.profileId }, select: safeSelect, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] }));
  }));
  router.post(base, wrap(async (req, res) => {
    if (!payment) artisanOnly(req);
    let data = payment
      ? { provider: req.body.provider, providerToken: req.body.providerToken, brand: req.body.brand, last4: req.body.last4, expiryMonth: Number(req.body.expiryMonth), expiryYear: Number(req.body.expiryYear) }
      : null;
    if (!payment) {
      const accountNumber = String(req.body.accountNumber || '').trim();
      const bankCode = String(req.body.bankCode || '').trim();
      if (!/^\d{10}$/.test(accountNumber) || !/^[A-Za-z0-9-]{2,20}$/.test(bankCode)) throw fail('Provide a valid Nigerian bank and 10-digit account number.');
      const resolved = await paystack.resolveAccount(accountNumber, bankCode);
      const recipient = await paystack.createRecipient({ name: resolved.account_name, accountNumber, bankCode });
      data = { provider: 'Paystack', recipientToken: recipient.recipient_code, bankName: recipient.details?.bank_name || req.body.bankName || 'Bank', accountName: resolved.account_name, accountLast4: accountNumber.slice(-4) };
    }
    const token = payment ? data.providerToken : data.recipientToken;
    if (!validToken(token)) throw fail('A valid token from the configured payment provider is required.');
    const strings = payment ? ['provider', 'brand', 'last4'] : ['provider', 'bankName', 'accountName', 'accountLast4'];
    if (strings.some((key) => typeof data[key] !== 'string' || !data[key].trim() || data[key].length > 100)) throw fail('Invalid payment metadata.');
    const last4 = payment ? data.last4 : data.accountLast4;
    if (!/^\d{4}$/.test(last4)) throw fail('Only the last four account digits may be stored.');
    if (payment && (!Number.isInteger(data.expiryMonth) || data.expiryMonth < 1 || data.expiryMonth > 12 || !Number.isInteger(data.expiryYear) || data.expiryYear < new Date().getFullYear())) throw fail('Invalid card expiry.');
    const created = await prisma.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM profiles WHERE id = ${req.user.profileId} FOR UPDATE`;
      const transactionModel = payment ? db.paymentMethod : db.payoutMethod;
      const isDefault = !(await transactionModel.count({ where: { profileId: req.user.profileId } }));
      return transactionModel.create({ data: { profileId: req.user.profileId, ...Object.fromEntries(Object.entries(data).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])), isDefault } });
    });
    res.status(201).json(Object.fromEntries(Object.entries(created).filter(([key]) => !['providerToken', 'recipientToken', 'profileId'].includes(key))));
  }));
  router.patch(`${base}/:id/default`, wrap(async (req, res) => {
    if (!payment) artisanOnly(req);
    res.json(await prisma.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM profiles WHERE id = ${req.user.profileId} FOR UPDATE`;
      const transactionModel = payment ? db.paymentMethod : db.payoutMethod;
      const owned = await transactionModel.findFirst({ where: { id: id(req.params.id), profileId: req.user.profileId } });
      if (!owned) throw fail('Method not found.', 404);
      await transactionModel.updateMany({ where: { profileId: req.user.profileId }, data: { isDefault: false } });
      return transactionModel.update({ where: { id: owned.id }, data: { isDefault: true }, select: safeSelect });
    }));
  }));
  router.delete(`${base}/:id`, wrap(async (req, res) => {
    if (!payment) artisanOnly(req);
    await prisma.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM profiles WHERE id = ${req.user.profileId} FOR UPDATE`;
      const transactionModel = payment ? db.paymentMethod : db.payoutMethod;
      const owned = await transactionModel.findFirst({ where: { id: id(req.params.id), profileId: req.user.profileId } });
      if (!owned) throw fail('Method not found.', 404);
      await transactionModel.delete({ where: { id: owned.id } });
      if (owned.isDefault) {
        const next = await transactionModel.findFirst({ where: { profileId: req.user.profileId }, orderBy: { createdAt: 'asc' } });
        if (next) await transactionModel.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
    res.json({ message: 'Method removed.' });
  }));
}
methodRoutes('payment');
methodRoutes('payout');

router.get('/services', wrap(async (req, res) => { artisanOnly(req); res.json(await prisma.service.findMany({ where: { artisanId: req.user.profileId }, orderBy: { createdAt: 'desc' } })); }));
router.post('/services', wrap(async (req, res) => {
  artisanOnly(req);
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
  const price = Number(req.body.price), durationMinutes = Number(req.body.durationMinutes);
  if (!name || name.length > 120 || description.length > 1000 || !Number.isFinite(price) || price <= 0 || price > 100000000 || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 10080) throw fail('Provide a valid service name, price, duration and description.');
  res.status(201).json(await prisma.service.create({ data: { artisanId: req.user.profileId, name, description, price, durationMinutes } }));
}));
router.patch('/services/:id', wrap(async (req, res) => {
  artisanOnly(req);
  const owned = await prisma.service.findFirst({ where: { id: id(req.params.id), artisanId: req.user.profileId } });
  if (!owned) throw fail('Service not found.', 404);
  const data = {};
  if (req.body.name !== undefined) { if (typeof req.body.name !== 'string' || !req.body.name.trim() || req.body.name.length > 120) throw fail('Invalid service name.'); data.name = req.body.name.trim(); }
  if (req.body.description !== undefined) { if (typeof req.body.description !== 'string' || req.body.description.length > 1000) throw fail('Invalid description.'); data.description = req.body.description.trim(); }
  if (req.body.price !== undefined) { const price = Number(req.body.price); if (!Number.isFinite(price) || price <= 0 || price > 100000000) throw fail('Invalid price.'); data.price = price; }
  if (req.body.durationMinutes !== undefined) { const duration = Number(req.body.durationMinutes); if (!Number.isInteger(duration) || duration < 1 || duration > 10080) throw fail('Invalid duration.'); data.durationMinutes = duration; }
  if (req.body.isActive !== undefined) { if (typeof req.body.isActive !== 'boolean') throw fail('Invalid status.'); data.isActive = req.body.isActive; }
  res.json(await prisma.service.update({ where: { id: owned.id }, data }));
}));

router.get('/availability', wrap(async (req, res) => { artisanOnly(req); res.json({ acceptingJobs: (await prisma.profile.findUnique({ where: { id: req.user.profileId }, select: { available: true } })).available, schedule: await prisma.availability.findMany({ where: { profileId: req.user.profileId }, orderBy: { weekday: 'asc' } }) }); }));
router.put('/availability', wrap(async (req, res) => {
  artisanOnly(req);
  if (typeof req.body.acceptingJobs !== 'boolean' || !Array.isArray(req.body.schedule) || req.body.schedule.length !== 7) throw fail('A complete weekly schedule is required.');
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  const weekdays = new Set();
  for (const day of req.body.schedule) {
    if (!Number.isInteger(day.weekday) || day.weekday < 0 || day.weekday > 6 || weekdays.has(day.weekday) || typeof day.enabled !== 'boolean' || !time.test(day.startTime) || !time.test(day.endTime) || (day.enabled && day.startTime >= day.endTime)) throw fail('Invalid weekly schedule.');
    weekdays.add(day.weekday);
  }
  await prisma.$transaction(async (db) => {
    await db.profile.update({ where: { id: req.user.profileId }, data: { available: req.body.acceptingJobs } });
    for (const day of req.body.schedule) await db.availability.upsert({ where: { profileId_weekday: { profileId: req.user.profileId, weekday: day.weekday } }, create: { profileId: req.user.profileId, ...day }, update: day });
  });
  res.json({ message: 'Availability saved.' });
}));

router.get('/service-areas', wrap(async (req, res) => { artisanOnly(req); const profile = await prisma.profile.findUnique({ where: { id: req.user.profileId }, select: { serviceAreas: true } }); res.json(profile); }));
router.put('/service-areas', wrap(async (req, res) => {
  artisanOnly(req);
  if (!Array.isArray(req.body.serviceAreas) || !req.body.serviceAreas.length || req.body.serviceAreas.length > 30 || req.body.serviceAreas.some((area) => typeof area !== 'string' || !area.trim() || area.length > 100)) throw fail('Select at least one valid service area.');
  res.json(await prisma.profile.update({ where: { id: req.user.profileId }, data: { serviceAreas: [...new Set(req.body.serviceAreas.map((area) => area.trim()))] }, select: { serviceAreas: true } }));
}));

router.get('/verification', wrap(async (req, res) => { artisanOnly(req); res.json(await prisma.verificationDocument.findMany({ where: { profileId: req.user.profileId }, orderBy: { type: 'asc' } })); }));
router.put('/verification/:type', wrap(async (req, res) => {
  artisanOnly(req);
  const type = String(req.params.type).toUpperCase();
  const allowed = ['IDENTITY', 'ADDRESS', 'CERTIFICATION'];
  if (!allowed.includes(type) || typeof req.body.documentUrl !== 'string' || !/^https:\/\//i.test(req.body.documentUrl) || req.body.documentUrl.length > 2000) throw fail('Provide a valid HTTPS document URL.');
  res.json(await prisma.verificationDocument.upsert({ where: { profileId_type: { profileId: req.user.profileId, type } }, create: { profileId: req.user.profileId, type, documentUrl: req.body.documentUrl, status: 'PENDING' }, update: { documentUrl: req.body.documentUrl, status: 'PENDING', rejectionReason: null } }));
}));

module.exports = router;
