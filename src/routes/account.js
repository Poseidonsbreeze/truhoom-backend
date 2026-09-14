const { Router } = require('express');
const { prisma } = require('../config/database');
const { requireAuth } = require('../middlewares/auth');
const router = Router();
router.use(requireAuth());
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
function coordinates(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw fail('Provide valid latitude and longitude.');
}
router.get('/profile', wrap(async (req, res) => {
  res.json(await prisma.profile.findUnique({ where: { id: req.user.profileId }, include: { role: true } }));
}));
router.patch('/profile', wrap(async (req, res) => {
  const data = {};
  for (const key of ['fullName', 'phone', 'address', 'about', 'avatarUrl', 'profession', 'responseTime']) {
    if (req.body[key] !== undefined) {
      if (typeof req.body[key] !== 'string' || req.body[key].length > 2000) throw fail(`Invalid ${key}`);
      data[key] = req.body[key].trim();
    }
  }
  if (data.fullName !== undefined && !data.fullName) throw fail('Name is required.');
  if (data.avatarUrl && !/^https?:\/\//i.test(data.avatarUrl)) throw fail('Photo URL must start with https:// or http://.');
  if (req.body.latitude !== undefined || req.body.longitude !== undefined) {
    coordinates(req.body.latitude, req.body.longitude);
    data.latitude = req.body.latitude; data.longitude = req.body.longitude;
  }
  if (req.user.role === 'ARTISAN') {
    if (req.body.available !== undefined) {
      if (typeof req.body.available !== 'boolean') throw fail('Invalid availability');
      data.available = req.body.available;
    }
    for (const key of ['skills', 'serviceAreas']) if (req.body[key] !== undefined) {
      if (!Array.isArray(req.body[key]) || req.body[key].length > 30 || req.body[key].some(x => typeof x !== 'string' || !x.trim() || x.length > 100)) throw fail(`Invalid ${key}`);
      data[key] = [...new Set(req.body[key].map(x => x.trim()))];
    }
    if (req.body.yearsExperience !== undefined) {
      if (!Number.isInteger(req.body.yearsExperience) || req.body.yearsExperience < 0 || req.body.yearsExperience > 100) throw fail('Invalid experience');
      data.yearsExperience = req.body.yearsExperience;
    }
  }
  if (req.body.email !== undefined) throw fail('Email cannot be changed here.');
  res.json(await prisma.profile.update({ where: { id: req.user.profileId }, data, include: { role: true } }));
}));
router.get('/addresses', wrap(async (req, res) => {
  res.json(await prisma.savedAddress.findMany({ where: { profileId: req.user.profileId }, orderBy: [{ isDefault: 'desc' }, { id: 'asc' }] }));
}));
router.post('/addresses', wrap(async (req, res) => {
  const { label, address, lat, lng } = req.body;
  if (typeof label !== 'string' || !label.trim() || label.length > 100 || typeof address !== 'string' || !address.trim() || address.length > 1000) throw fail('Provide a label and full address.');
  coordinates(lat, lng);
  const result = await prisma.$transaction(async db => {
    // Serialize default-address changes per account.
    await db.$queryRaw`SELECT id FROM profiles WHERE id = ${req.user.profileId} FOR UPDATE`;
    const isDefault = !(await db.savedAddress.count({ where: { profileId: req.user.profileId } }));
    const saved = await db.savedAddress.create({ data: { profileId: req.user.profileId, label: label.trim(), address: address.trim(), lat, lng, isDefault } });
    if (isDefault) await db.profile.update({ where: { id: req.user.profileId }, data: { address: saved.address, latitude: lat, longitude: lng } });
    return saved;
  });
  res.status(201).json(result);
}));
router.patch('/addresses/:id/default', wrap(async (req, res) => {
  res.json(await prisma.$transaction(async db => {
    await db.$queryRaw`SELECT id FROM profiles WHERE id = ${req.user.profileId} FOR UPDATE`;
    const saved = await db.savedAddress.findFirst({ where: { id: Number(req.params.id) || 0, profileId: req.user.profileId } });
    if (!saved) throw fail('Address not found', 404);
    await db.savedAddress.updateMany({ where: { profileId: req.user.profileId }, data: { isDefault: false } });
    await db.profile.update({ where: { id: req.user.profileId }, data: { address: saved.address, latitude: saved.lat, longitude: saved.lng } });
    return db.savedAddress.update({ where: { id: saved.id }, data: { isDefault: true } });
  }));
}));
router.delete('/addresses/:id', wrap(async (req, res) => {
  await prisma.$transaction(async db => {
    await db.$queryRaw`SELECT id FROM profiles WHERE id = ${req.user.profileId} FOR UPDATE`;
    const saved = await db.savedAddress.findFirst({ where: { id: Number(req.params.id) || 0, profileId: req.user.profileId } });
    if (!saved) throw fail('Address not found', 404);
    await db.savedAddress.delete({ where: { id: saved.id } });
    if (saved.isDefault) {
      const next = await db.savedAddress.findFirst({ where: { profileId: req.user.profileId }, orderBy: { id: 'asc' } });
      if (next) await db.savedAddress.update({ where: { id: next.id }, data: { isDefault: true } });
      await db.profile.update({ where: { id: req.user.profileId }, data: { address: next?.address || null, latitude: next?.lat ?? null, longitude: next?.lng ?? null } });
    }
  });
  res.json({ message: 'Address removed' });
}));
module.exports = router;
