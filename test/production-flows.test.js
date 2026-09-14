require('dotenv').config();
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { prisma } = require('../src/config/database');
const auth = require('../src/services/auth');
const { app } = require('../src/app');

test('production screen flows persist and enforce authorization', async () => {
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname));
  const marker = randomUUID(); const emails = []; const profileIds = [];
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, token, method = 'GET', body) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json() };
  };
  const make = async (role, name) => {
    const email = `prod-${marker}-${name}@example.invalid`; emails.push(email);
    const account = await auth.signup({ email, password: 'Production-test-123!', fullName: name, role });
    profileIds.push(account.profile.id); return { ...account, token: account.session.access_token };
  };
  try {
    const customer = await make('CUSTOMER', 'Customer'); const otherCustomer = await make('CUSTOMER', 'OtherCustomer');
    const artisan = await make('ARTISAN', 'Artisan'); const otherArtisan = await make('ARTISAN', 'OtherArtisan');
    let result = await call('/api/account/addresses', customer.token, 'POST', { label: 'Home', address: '1 Production Street', lat: 6.45, lng: 3.47 });
    const address = result.data;
    result = await call('/api/operations/services', artisan.token, 'POST', { name: 'Safe repair', description: 'Production service', price: 12000, durationMinutes: 90 });
    assert.equal(result.status, 201); const service = result.data;
    assert.equal((await call('/api/operations/services', customer.token)).status, 403);
    assert.equal((await call(`/api/operations/services/${service.id}`, otherArtisan.token, 'PATCH', { price: 1 })).status, 404);
    result = await call(`/api/operations/services/${service.id}`, artisan.token, 'PATCH', { price: 13000, isActive: false }); assert.equal(result.data.isActive, false);
    await call(`/api/operations/services/${service.id}`, artisan.token, 'PATCH', { isActive: true });

    const schedule = Array.from({ length: 7 }, (_, weekday) => ({ weekday, enabled: weekday > 0 && weekday < 6, startTime: '09:00', endTime: '17:00' }));
    assert.equal((await call('/api/operations/availability', artisan.token, 'PUT', { acceptingJobs: true, schedule })).status, 200);
    result = await call('/api/operations/availability', artisan.token); assert.equal(result.data.schedule.length, 7); assert.equal(result.data.acceptingJobs, true);
    assert.equal((await call('/api/operations/availability', artisan.token, 'PUT', { acceptingJobs: true, schedule: schedule.map((day) => ({ ...day, endTime: day.weekday === 1 ? '08:00' : day.endTime })) })).status, 400);
    assert.equal((await call('/api/operations/service-areas', artisan.token, 'PUT', { serviceAreas: ['Lekki', 'Ikoyi', 'Lekki'] })).status, 200);
    result = await call('/api/operations/service-areas', artisan.token); assert.deepEqual(result.data.serviceAreas.sort(), ['Ikoyi', 'Lekki']);
    assert.equal((await call('/api/operations/verification/IDENTITY', artisan.token, 'PUT', { documentUrl: 'http://unsafe.example/id' })).status, 400);
    assert.equal((await call('/api/operations/verification/IDENTITY', artisan.token, 'PUT', { documentUrl: 'https://private.example/id-token' })).status, 200);
    result = await call('/api/operations/verification', artisan.token); assert.equal(result.data[0].status, 'PENDING');
    assert.equal((await call('/api/operations/verification', customer.token)).status, 403);

    const payment = { provider: 'test-provider', providerToken: `pm_${marker}`, brand: 'Visa', last4: '4242', expiryMonth: 12, expiryYear: new Date().getFullYear() + 1 };
    result = await call('/api/operations/payment-methods', customer.token, 'POST', payment); assert.equal(result.status, 201); assert.equal(result.data.providerToken, undefined);
    const paymentId = result.data.id;
    result = await call('/api/operations/payment-methods', customer.token); assert.equal(result.data[0].providerToken, undefined);
    assert.equal((await call(`/api/operations/payment-methods/${paymentId}`, otherCustomer.token, 'DELETE')).status, 404);
    assert.equal((await call('/api/operations/payment-methods', customer.token, 'POST', { ...payment, providerToken: 'bad', last4: '42424242' })).status, 400);
    assert.equal((await call('/api/operations/payout-methods', customer.token)).status, 403);

    const bookingBody = { serviceId: service.id, addressId: address.id, scheduledAt: new Date(Date.now() + 86400000).toISOString(), notes: 'Ring the bell' };
    assert.equal((await call('/api/bookings/quote', customer.token, 'POST', { ...bookingBody, artisanId: artisan.profile.id })).status, 400);
    result = await call('/api/bookings/quote', customer.token, 'POST', { ...bookingBody, artisanId: artisan.profile.id, customerBudget: 10000 });
    assert.equal(result.status, 201); const quoteBooking = result.data.booking; assert.equal(quoteBooking.status, 'QUOTE_REQUESTED'); assert.equal(Number(quoteBooking.customerBudget), 10000);
    assert.ok((await call('/api/bookings', artisan.token)).data.some((item) => item.id === quoteBooking.id && item.bookingType === 'QUOTE'));
    assert.equal((await call(`/api/bookings/${quoteBooking.id}/quote`, otherArtisan.token, 'PATCH', { amount: 15000, message: 'Unauthorized offer' })).status, 409);
    result = await call(`/api/bookings/${quoteBooking.id}/quote`, artisan.token, 'PATCH', { amount: 15000, message: 'Parts and labour included' });
    assert.equal(result.status, 200); assert.equal(result.data.status, 'QUOTE_OFFERED'); assert.equal(Number(result.data.quotedPrice), 15000);
    result = await call('/api/bookings', customer.token);
    assert.ok(result.data.some((item) => item.id === quoteBooking.id && item.status === 'QUOTE_OFFERED' && Number(item.quotedPrice) === 15000 && item.quoteMessage === 'Parts and labour included'));
    assert.equal((await call(`/api/bookings/${quoteBooking.id}/quote-response`, otherCustomer.token, 'PATCH', { action: 'accept' })).status, 409);
    result = await call(`/api/bookings/${quoteBooking.id}/quote-response`, customer.token, 'PATCH', { action: 'accept' });
    assert.equal(result.status, 200); assert.equal(result.data.status, 'ASSIGNED');
    result = await call('/api/bookings/instant', customer.token, 'POST', bookingBody); assert.equal(result.status, 201); const declinedBooking = result.data.booking;
    assert.ok((await call('/api/bookings', artisan.token)).data.some((item) => item.id === declinedBooking.id));
    assert.equal((await call(`/api/bookings/${declinedBooking.id}/status`, artisan.token, 'PATCH', { action: 'decline' })).status, 200);
    assert.ok(!(await call('/api/bookings', artisan.token)).data.some((item) => item.id === declinedBooking.id));
    result = await call('/api/bookings/instant', customer.token, 'POST', bookingBody); const booking = result.data.booking;
    assert.equal((await call(`/api/bookings/${booking.id}/status`, otherArtisan.token, 'PATCH', { action: 'accept' })).status, 409);
    assert.equal((await call(`/api/bookings/${booking.id}/status`, artisan.token, 'PATCH', { action: 'accept' })).status, 200);
    assert.equal((await call(`/api/bookings/${booking.id}/status`, artisan.token, 'PATCH', { action: 'start' })).status, 409);
    await prisma.booking.update({ where: { id: booking.id }, data: { paymentStatus: 'PAID', paymentAmount: 13000, platformFee: 1300, artisanNet: 11700, paidAt: new Date() } });
    assert.equal((await call(`/api/bookings/${booking.id}/status`, artisan.token, 'PATCH', { action: 'start' })).data.status, 'IN_PROGRESS');
    result = await call(`/api/bookings/${booking.id}/status`, artisan.token, 'PATCH', { action: 'complete' });
    assert.equal(result.data.status, 'AWAITING_COMPLETION_CONFIRMATION'); assert.ok(result.data.artisanCompletedAt); assert.equal(result.data.customerCompletedAt, null);
    assert.equal((await call(`/api/bookings/${booking.id}/status`, artisan.token, 'PATCH', { action: 'complete' })).status, 409);
    assert.equal((await call(`/api/bookings/${booking.id}/status`, otherCustomer.token, 'PATCH', { action: 'confirm-completion' })).status, 404);
    result = await call(`/api/bookings/${booking.id}/status`, customer.token, 'PATCH', { action: 'confirm-completion' });
    assert.equal(result.data.status, 'COMPLETED'); assert.ok(result.data.customerCompletedAt);
    assert.equal((await call(`/api/bookings/${booking.id}`, otherCustomer.token)).status, 404);
    result = await call(`/api/bookings/${booking.id}/review`, customer.token, 'POST', { rating: 5, comment: 'Excellent work' }); assert.equal(result.status, 201);
    assert.equal((await call(`/api/bookings/${booking.id}/review`, customer.token, 'POST', { rating: 4, comment: 'Again' })).status, 409);
    assert.equal((await call(`/api/bookings/${booking.id}/review`, otherCustomer.token, 'POST', { rating: 5, comment: 'Unauthorized' })).status, 403);

    result = await call('/api/messages', customer.token, 'POST', { profileId: artisan.profile.id }); assert.equal(result.status, 201); const conversation = result.data;
    assert.equal((await call('/api/messages', customer.token, 'POST', { profileId: otherCustomer.profile.id })).status, 400);
    assert.equal((await call(`/api/messages/${conversation.id}`, otherCustomer.token)).status, 404);
    result = await call(`/api/messages/${conversation.id}/messages`, customer.token, 'POST', { body: 'Hello artisan' }); assert.equal(result.status, 201);
    assert.equal((await call(`/api/messages/${conversation.id}/messages`, otherCustomer.token, 'POST', { body: 'Intrusion' })).status, 404);
    result = await call(`/api/messages/${conversation.id}`, artisan.token); assert.equal(result.data.messages[0].body, 'Hello artisan');
    result = await call('/api/messages', artisan.token); assert.equal(result.data[0].unreadCount, 0);
    result = await call('/api/operations/notifications', artisan.token); assert.ok(result.data.length >= 2); const notification = result.data.find((item) => !item.read);
    assert.equal((await call(`/api/operations/notifications/${notification.id}/read`, otherArtisan.token, 'PATCH')).status, 404);
    assert.equal((await call(`/api/operations/notifications/${notification.id}/read`, artisan.token, 'PATCH')).status, 200);
    assert.equal((await call('/api/operations/notifications/read-all', artisan.token, 'PATCH')).status, 200);
    result = await call('/api/bookings/dashboard', artisan.token); assert.equal(result.status, 200); assert.ok(result.data.completedJobs >= 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await prisma.profile.deleteMany({ where: { id: { in: profileIds }, email: { in: emails } } });
    await prisma.$disconnect();
  }
});
