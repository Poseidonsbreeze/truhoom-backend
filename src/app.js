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
app.use(express.json());

app.use('/auth', authRoutes);

io.on('connection', (socket) => {
  console.log(`[WS] Client connected: ${socket.id}`);

  socket.on('join:artisan', (artisanId) => {
    socket.join(`artisan:${artisanId}`);
    console.log(`[WS] ${socket.id} joined artisan:${artisanId}`);
  });

  socket.on('join:customer', (customerId) => {
    socket.join(`customer:${customerId}`);
    console.log(`[WS] ${socket.id} joined customer:${customerId}`);
  });

  socket.on('disconnect', () => {
    console.log(`[WS] Client disconnected: ${socket.id}`);
  });
});

app.post(
  '/api/bookings/instant',
  requireAuth(['CUSTOMER']),
  createInstantRequestController
);

app.post(
  '/api/bookings/quote',
  requireAuth(['CUSTOMER']),
  createQuoteRequestController
);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack || err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

async function start(port) {
  await connectDatabase();
  server.listen(port, () => {
    console.log(`[SERVER] Truho API running on port ${port}`);
  });
}

module.exports = { app, server, io, start };
