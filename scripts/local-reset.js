require('dotenv').config();
const auth = require('../src/services/auth');
const { prisma } = require('../src/config/database');
(async () => {
  if (!process.argv[2]) throw new Error('Usage: npm run auth:reset -- user@example.com');
  const token = await auth.createResetToken(process.argv[2]);
  console.log('Paste this single-use token into Reset Password within 15 minutes:');
  console.log(token);
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
