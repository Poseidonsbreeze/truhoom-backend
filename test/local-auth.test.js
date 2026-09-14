require('dotenv').config();
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { prisma } = require('../src/config/database');
const auth = require('../src/services/auth');
const { app } = require('../src/app');
const hash = token => createHash('sha256').update(token).digest('hex');

test('local authentication lifecycle against PostgreSQL', async () => {
  const host = new URL(process.env.DATABASE_URL).hostname;
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(host), 'Only run this test against local PostgreSQL');
  const marker = randomUUID();
  const email = `auth-test-${marker}@example.invalid`;
  const artisanEmail = `artisan-test-${marker}@example.invalid`;
  const legacyEmail = `legacy-test-${marker}@example.invalid`;
  const password = 'Local-test-password-123!';
  const listener = app.listen(0, '127.0.0.1');
  await new Promise(resolve => listener.once('listening', resolve));
  const base = `http://127.0.0.1:${listener.address().port}`;
  const request = async (path, body, token, method = 'POST') => {
    const response = await fetch(base + path, { method, headers: {
      'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json() };
  };
  try {
    let result = await request('/auth/signup', { email, password, fullName: 'Local Test', role: 'CUSTOMER' });
    assert.equal(result.status, 201);
    const signedUp = result.data;
    assert.equal(signedUp.requiresEmailConfirmation, false);
    assert.ok(signedUp.session.access_token);
    assert.equal(signedUp.profile.credential, undefined);
    const stored = await prisma.localCredential.findUnique({ where: { email } });
    assert.ok(stored.passwordHash.startsWith('scrypt$'));
    assert.ok(!stored.passwordHash.includes(password));
    const session = await prisma.localSession.findUnique({ where: { accessHash: hash(signedUp.session.access_token) } });
    assert.notEqual(session.accessHash, signedUp.session.access_token);
    assert.equal((await request('/auth/signup', { email: email.toUpperCase(), password, fullName: 'Duplicate', role: 'CUSTOMER' })).status, 409);
    assert.equal((await request('/auth/login', { email, password: 'wrong' })).status, 401);
    assert.equal((await request('/auth/login', { email, password: {} })).status, 400);
    assert.equal((await request('/auth/signup', { email: 'invalid', password, fullName: 'Invalid', role: 'ADMIN' })).status, 400);
    result = await request('/auth/login', { email: email.toUpperCase(), password });
    assert.equal(result.status, 200);
    const login = result.data;
    result = await request('/auth/me', undefined, login.session.access_token, 'GET');
    assert.equal(result.status, 200);
    assert.equal(result.data.profile.id, signedUp.profile.id);
    assert.equal((await request('/auth/me', undefined, 'mock-customer-token', 'GET')).status, 401);
    const artisan = await auth.signup({ email: artisanEmail, password, fullName: 'Artisan Test', role: 'ARTISAN' });
    assert.equal((await request('/api/bookings/instant', {}, artisan.session.access_token)).status, 403);
    result = await request('/auth/refresh', { refreshToken: login.session.refresh_token });
    assert.equal(result.status, 200);
    const rotated = result.data.session;
    assert.notEqual(rotated.access_token, login.session.access_token);
    assert.equal((await request('/auth/refresh', { refreshToken: login.session.refresh_token })).status, 401);
    assert.equal((await request('/auth/me', undefined, login.session.access_token, 'GET')).status, 401);
    await request('/auth/logout', {}, rotated.access_token);
    assert.equal((await request('/auth/refresh', { refreshToken: rotated.refresh_token })).status, 401);
    await prisma.localSession.updateMany({ where: { profileId: signedUp.profile.id }, data: { accessExpiresAt: new Date(0) } });
    assert.equal((await request('/auth/me', undefined, signedUp.session.access_token, 'GET')).status, 401);
    result = await request('/auth/forgot-password', { email });
    assert.equal(result.status, 200);
    assert.equal(result.data.accessToken, undefined);
    const resetToken = await auth.createResetToken(email);
    result = await request('/auth/reset-password', { accessToken: resetToken, newPassword: password + 'new' });
    assert.equal(result.status, 200);
    assert.equal((await request('/auth/reset-password', { accessToken: resetToken, newPassword: password })).status, 400);
    assert.equal((await request('/auth/login', { email, password })).status, 401);
    assert.equal((await request('/auth/login', { email, password: password + 'new' })).status, 200);
    assert.equal((await request('/auth/refresh', { refreshToken: signedUp.session.refresh_token })).status, 401);
    const expired = await auth.createResetToken(email);
    await prisma.passwordReset.update({ where: { tokenHash: hash(expired) }, data: { expiresAt: new Date(0) } });
    await assert.rejects(auth.resetPassword(expired, password), /expired/);
    const legacy = await prisma.profile.create({ data: { authId: randomUUID(), email: legacyEmail, fullName: 'Existing Profile', roleId: signedUp.profile.roleId } });
    await assert.rejects(auth.signup({ email: legacyEmail, password, fullName: 'Replacement', role: 'ARTISAN' }), /already exists/);
    await auth.resetPassword(await auth.createResetToken(legacyEmail), password);
    const migrated = await auth.login({ email: legacyEmail, password });
    assert.equal(migrated.profile.id, legacy.id);
    assert.equal(migrated.profile.role.name, 'CUSTOMER');
  } finally {
    await new Promise(resolve => listener.close(resolve));
    await prisma.profile.deleteMany({ where: { email: { in: [email, artisanEmail, legacyEmail] } } });
    await prisma.$disconnect();
  }
});
