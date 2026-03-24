require('dotenv').config(); // Restart 1

// Global safety net for background job failures (e.g. Redis down)
process.on('unhandledRejection', (err) => {
  const msg = err?.message || String(err);
  if (msg.includes('Connection is closed') || msg.includes('ECONNREFUSED') || msg.includes('Redis')) {
    // Silence noisy connection errors
    return;
  }
  console.error(`Unhandled Rejection: ${msg}`);
});
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const responseTime = require('response-time');

const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const budgetRoutes = require('./routes/budgetRoutes');
const accountRoutes = require('./routes/accountRoutes');
const paymentMethodRoutes = require('./routes/paymentMethodRoutes');
const contactRoutes = require('./routes/contactRoutes');
const debtRoutes = require('./routes/debtRoutes');
const metalRoutes = require('./routes/metalRoutes');
const landRoutes = require('./routes/landRoutes');
const wealthRoutes = require('./routes/wealthRoutes');
const goalRoutes = require('./routes/goalRoutes');
const insightsRoutes = require('./routes/insightsRoutes');
const investmentRoutes = require('./routes/investmentRoutes');
const familyRoutes = require('./routes/familyRoutes');

const cron = require('node-cron');
const { metalQueue } = require('./config/queue');
require('./workers/metalWorker'); // Start the worker

// Connect to database
connectDB().then(() => {
  // ─── CRON JOBS ───
  // Update metal rates at 10:00 AM IST daily (Requirement #2)
  // IST is UTC+5:30. So 10:00 AM IST = 04:30 AM UTC.
  cron.schedule('30 4 * * *', async () => {
    try {
      console.log('⏰ CRON: Adding gold/silver rate update job to queue...');
      await metalQueue.add('update-rates', { force: true });
    } catch (err) {
      console.log('⚠️ Could not add background job (Redis may be down)');
    }
  });

  // Requirement #13: Server Startup Fallback
  setTimeout(async () => {
    try {
      console.log('🔄 Adding startup rate check job to queue...');
      await metalQueue.add('update-rates', { force: false });
    } catch (err) {
      console.log('⚠️ Could not add startup background job (Redis may be down)');
    }
  }, 2000);
});

const app = express();
app.set('etag', false); // Disable ETags globally to prevent 304 issues in mobile dev

// Security headers
app.use(helmet());

// Performance monitoring
app.use(responseTime((req, res, time) => {
  console.log(`⏱️ ${req.method} ${req.url} - ${time.toFixed(2)}ms`);
}));

// CORS
app.use(
  cors({
    origin: '*', // Allow all origins in development for mobile testing
    credentials: true,
  })
);

// Request Logger
app.use((req, res, next) => {
  res.setHeader('X-Server-Version', '2.2.0-undo-ready');
  console.log(`📡 ${req.method} ${req.path}`);
  next();
});

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Compression
app.use(compression());

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Money Tracker API is running 🚀', timestamp: new Date().toISOString() });
});

app.get('/api/health-check-2', (req, res) => {
  res.json({ success: true, message: 'Health check 2' });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/payment-methods', paymentMethodRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/debts', debtRoutes);
app.use('/api/metals', metalRoutes);
app.use('/api/land', landRoutes);
app.use('/api/wealth', wealthRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/insights', insightsRoutes);
app.use('/api/family', familyRoutes);
app.use('/api/investments', investmentRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

// Handle port-in-use error gracefully
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use.`);
    console.error(`💡 Fix: Run "taskkill /F /IM node.exe" in PowerShell, then restart.`);
    process.exit(1);
  }
  throw err;
});


// Graceful shutdown — release port properly
const shutdown = () => {
  console.log('\n🛑 Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed. Port released.');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 3000); // Force exit after 3s
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = app;
console.log('✅ SERVER HEARTBEAT: Routes updated at ' + new Date().toLocaleTimeString());
