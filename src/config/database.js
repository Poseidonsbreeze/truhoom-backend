const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'stdout', level: 'info' },
    { emit: 'stdout', level: 'warn' },
    { emit: 'stdout', level: 'error' },
  ],
});

if (process.env.DATABASE_LOG_QUERIES === 'true') {
  prisma.$on('query', (e) => {
    console.log(`[DB QUERY] ${e.query} ${e.params} ${e.duration}ms`);
  });
}

async function connectDatabase() {
  try {
    await prisma.$connect();
    console.log('[DB] Connected to PostgreSQL via Prisma');
  } catch (err) {
    console.error('[DB] Connection failed:', err.message);
    process.exit(1);
  }
}

async function disconnectDatabase() {
  try {
    await prisma.$disconnect();
    console.log('[DB] Disconnected');
  } catch (err) {
    console.error('[DB] Disconnect error:', err.message);
  }
}

module.exports = { prisma, connectDatabase, disconnectDatabase };
