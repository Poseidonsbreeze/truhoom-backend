require('dotenv').config();
const auth = require('../src/services/auth');
const { prisma } = require('../src/config/database');

(async () => {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Admin';

  if (!email || !password) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD environment variables');
  }

  console.log(`Creating admin user: ${email}`);

  try {
    const result = await auth.signup({ email, password, fullName: name, role: 'ADMIN' });
    console.log('✅ Admin created successfully!');
    console.log('Email:', result.user.email);
    console.log('Access token:', result.session.access_token);
    console.log('\nUse these credentials to log in at http://localhost:4173');
  } catch (error) {
    if (error.code === 'P2002') {
      console.error('❌ An account already exists for this email.');
    } else {
      console.error('❌ Error:', error.message);
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();