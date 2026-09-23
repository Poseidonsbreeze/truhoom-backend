require('dotenv').config({ override: true });
const { prisma } = require('../src/config/database');
const auth = require('../src/services/auth');

async function main() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');
  const fullName = String(process.env.ADMIN_NAME || 'Truhoom Admin').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12) {
    throw new Error('Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters in .env.');
  }
  const existing = await prisma.profile.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, include: { credential: true } });
  if (existing) {
    if (!existing.credential) throw new Error('The existing account has no local password. Reset its password before promoting it.');
    const role = await prisma.role.upsert({ where: { name: 'ADMIN' }, update: {}, create: { name: 'ADMIN' } });
    await prisma.profile.update({ where: { id: existing.id }, data: { roleId: role.id } });
    console.log(`Admin access enabled for ${email}. Existing password retained.`);
    return;
  }
  await auth.signup({ email, password, fullName, role: 'ADMIN' });
  console.log(`Admin account created for ${email}.`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
