require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');

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

const cron = require('node-cron');
const { updateMetalRates } = require('./controllers/metalController');

// Connect to database
connectDB().then(() => {
  // ─── CRON JOBS ───
  // Update metal rates at 10:00 AM IST daily (Requirement #2)
  // IST is UTC+5:30. So 10:00 AM IST = 04:30 AM UTC.
  cron.schedule('30 4 * * *', async () => {
    console.log('⏰ CRON: Scheduled daily metal rate update started...');
    await updateMetalRates(true); // Force sync to ensure fresh data
  });

  // Requirement #13: Server Startup Fallback
  // Ensure today's data exists immediately on startup
  setTimeout(() => {
    console.log('🔄 Checking metal rates on startup...');
    updateMetalRates(false); // Change to false: don't force if today's rates exist
  }, 2000);
});

const app = express();

// Security headers
app.use(helmet());

// CORS
app.use(
  cors({
    origin: '*', // Allow all origins in development for mobile testing
    credentials: true,
  })
);

// Request Logger
app.use((req, res, next) => {
  res.setHeader('X-Server-Version', '2.1.0-archive-isolation');
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

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error(`Unhandled Rejection: ${err.message}`);
  server.close(() => process.exit(1));
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
