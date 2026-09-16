const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { connectDatabase } = require('./config/database');
const { requireAuth } = require('./middlewares/auth');
const {
  createInstantRequestController,
  createQuoteRequestController,
} = require('./controllers/booking');
const authRoutes = require('./routes/auth');
const discoveryRoutes = require('./routes/discovery');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
});

app.set('io', io);

app.use(cors());
app.use(express.json({ verify: (req, res, buffer) => { req.rawBody = buffer; } }));

app.use('/auth', authRoutes);
app.use('/api/account', require('./routes/account'));
app.use('/api/discovery', discoveryRoutes);
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/operations', require('./routes/operations'));
app.use('/api/payments', require('./routes/payments').router);
app.use('/api/admin', require('./routes/admin'));

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    const profile = await require('./services/auth').authenticate(token);
    socket.data.profile = profile;
    next();
  } catch (error) {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  console.log(`[WS] Client connected: ${socket.id}`);
  socket.join(`profile:${socket.data.profile.id}`);
  if (socket.data.profile.role.name === 'ARTISAN') socket.join(`artisan:${socket.data.profile.id}`);

  socket.on('disconnect', () => {
    console.log(`[WS] Client disconnected: ${socket.id}`);
  });
});

app.post('/api/bookings/instant', requireAuth(['CUSTOMER']), createInstantRequestController);
app.post('/api/bookings/quote', requireAuth(['CUSTOMER']), createQuoteRequestController);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[ERROR]', err.stack || err.message);
  res.status(status).json({
    error: err.message || 'Internal server error',
    code: err.code,
  });
});

async function start(port) {
  await connectDatabase();
  server.listen(port, () => {
    console.log(`[SERVER] Truho API running on port ${port}`);
  });
}

module.exports = { app, server, io, start };
