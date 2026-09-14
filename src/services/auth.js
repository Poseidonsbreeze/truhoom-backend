const { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const { prisma } = require('../config/database');
const deriveKey = promisify(scrypt);
const normalizeEmail = email => email.trim().toLowerCase();
const digest = token => createHash('sha256').update(token).digest('hex');
const failure = (message, status = 401) => Object.assign(new Error(message), { status });

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await deriveKey(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${salt}$${key.toString('hex')}`;
}
async function verifyPassword(password, encoded) {
  const [, salt, hex] = encoded.split('$');
  const expected = Buffer.from(hex, 'hex');
  const actual = await deriveKey(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
function publicUser(profile) {
  return { id: profile.authId, email: profile.email, user_metadata: { full_name: profile.fullName }, role: profile.role.name };
}
async function issueSession(db, profile) {
  const access = randomBytes(32).toString('hex');
  const refresh = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000);
  await db.localSession.create({ data: {
    profileId: profile.id, accessHash: digest(access), refreshHash: digest(refresh),
    accessExpiresAt: expires, refreshExpiresAt: new Date(Date.now() + 30 * 86400000),
  } });
  return { user: publicUser(profile), profile, session: {
    access_token: access, refresh_token: refresh, token_type: 'bearer',
    expires_in: 3600, expires_at: Math.floor(expires.getTime() / 1000),
  } };
}

const AuthService = {
  async signup({ email, password, fullName, role }) {
    email = normalizeEmail(email);
    const passwordHash = await hashPassword(password);
    try {
      return await prisma.$transaction(async db => {
        if (await db.profile.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } })) {
          throw failure('An account already exists for this email. Sign in or reset its local password.', 409);
        }
        const roleRecord = await db.role.upsert({ where: { name: role }, update: {}, create: { name: role } });
        const profile = await db.profile.create({ data: {
          authId: randomUUID(), email, fullName: fullName.trim(), roleId: roleRecord.id,
          credential: { create: { email, passwordHash } },
        }, include: { role: true } });
        return issueSession(db, profile);
      });
    } catch (error) {
      if (error.code === 'P2002') throw failure('An account already exists for this email.', 409);
      throw error;
    }
  },
  async login({ email, password }) {
    const credential = await prisma.localCredential.findUnique({
      where: { email: normalizeEmail(email) }, include: { profile: { include: { role: true } } },
    });
    if (!credential || !await verifyPassword(password, credential.passwordHash)) {
      throw failure('Invalid email or password. Existing accounts need a local password reset before their first local login.');
    }
    return issueSession(prisma, credential.profile);
  },
  async authenticate(token) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw failure('Invalid or expired token');
    const session = await prisma.localSession.findUnique({
      where: { accessHash: digest(token) }, include: { profile: { include: { role: true } } },
    });
    if (!session || session.accessExpiresAt <= new Date()) throw failure('Invalid or expired token');
    return session.profile;
  },
  async logout(token) {
    if (token) await prisma.localSession.deleteMany({ where: { accessHash: digest(token) } });
  },
  async refreshSession(token) {
    return prisma.$transaction(async db => {
      const session = await db.localSession.findUnique({
        where: { refreshHash: digest(token) }, include: { profile: { include: { role: true } } },
      });
      if (!session || session.refreshExpiresAt <= new Date()) throw failure('Invalid or expired refresh token');
      const removed = await db.localSession.deleteMany({ where: { id: session.id } });
      if (!removed.count) throw failure('Refresh token already used');
      return issueSession(db, session.profile);
    });
  },
  async forgotPassword() {
    // No email transport is configured for local authentication. Never return reset secrets to an unauthenticated caller.
    return { message: 'Local password recovery is handled by the app administrator. Request a reset token, then choose ?I already have a reset token?.' };
  },
  // Operator-only CLI entry point, never exposed as an HTTP route.
  async createResetToken(email) {
    const profiles = await prisma.profile.findMany({ where: { email: { equals: normalizeEmail(email), mode: 'insensitive' } } });
    if (profiles.length !== 1) throw failure('Expected exactly one profile for this email.', 400);
    const token = randomBytes(32).toString('hex');
    await prisma.$transaction(async db => {
      await db.passwordReset.deleteMany({ where: { profileId: profiles[0].id } });
      await db.passwordReset.create({ data: { profileId: profiles[0].id, tokenHash: digest(token), expiresAt: new Date(Date.now() + 15 * 60000) } });
    });
    return token;
  },
  async resetPassword(token, password) {
    const passwordHash = await hashPassword(password);
    await prisma.$transaction(async db => {
      const reset = await db.passwordReset.findUnique({ where: { tokenHash: digest(token) }, include: { profile: true } });
      if (!reset || reset.expiresAt <= new Date()) throw failure('Invalid or expired reset token', 400);
      const removed = await db.passwordReset.deleteMany({ where: { id: reset.id } });
      if (!removed.count) throw failure('Reset token already used', 400);
      await db.localCredential.upsert({ where: { profileId: reset.profileId },
        create: { profileId: reset.profileId, email: normalizeEmail(reset.profile.email), passwordHash }, update: { passwordHash } });
      await db.localSession.deleteMany({ where: { profileId: reset.profileId } });
      await db.passwordReset.deleteMany({ where: { profileId: reset.profileId } });
    });
  },
  async getProfile(authId) {
    const profile = await prisma.profile.findUnique({ where: { authId }, include: { role: true } });
    if (!profile) throw failure('Profile not found', 404);
    return profile;
  },
  async completeProfile(profileId, { phone, address, avatarUrl }) {
    return prisma.profile.update({ where: { id: profileId }, data: { phone, address, avatarUrl: avatarUrl || undefined }, include: { role: true } });
  },
};
module.exports = AuthService;
