require('dotenv').config();
const { start } = require('./app');

const PORT = parseInt(process.env.PORT, 10) || 3000;

start(PORT).catch((err) => {
  console.error('[FATAL] Failed to start server:', err.message);
  process.exit(1);
});
