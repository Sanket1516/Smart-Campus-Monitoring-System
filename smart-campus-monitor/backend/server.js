require('dotenv').config();
const fs = require('fs');
const express = require('express');
const http = require('http');
const https = require('https');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const connectDB = require('./config/db');
const { validateEnv } = require('./config/validateEnv');
const { getSyncConfig } = require('./config/terminalSync');
const { createIclockRouter } = require('./routes/iclock');
const errorHandler = require('./middleware/errorHandler');
const { register, metricsMiddleware } = require('./utils/metrics');

// Route imports
const authRoutes = require('./routes/auth');
const studentBulkRoutes = require('./routes/studentBulk');
const studentRoutes = require('./routes/students');
const scanRoutes = require('./routes/scan');
const logRoutes = require('./routes/logs');
const dashboardRoutes = require('./routes/dashboard');
const notifyRoutes = require('./routes/notify');
const visitorRoutes = require('./routes/visitors');
const terminalRoutes = require('./routes/terminals');
const hostelRoutes = require('./routes/hostels');
const alertRoutes = require('./routes/alerts');
const fingerprintRoutes = require('./routes/fingerprint');
const enrollmentRoutes = require('./routes/enrollment');
const accessRoutes = require('./routes/access');
const hostellerRoutes = require('./routes/hosteller');
const liveRoutes = require('./routes/live');
const settingsRoutes = require('./routes/settings');
const aiQueryRoutes = require('./routes/aiQuery');
const syncRoutes = require('./routes/sync');
const { startTerminalJobs } = require('./jobs/terminalJobs');
const { startHostellerJobs } = require('./jobs/hostellerJobs');
const { startSyncJobs } = require('./jobs/syncJobs');
const { attachSocketServer } = require('./socket');

// Fail at startup if required secrets are missing (no development fallbacks).
if (process.env.NODE_ENV !== 'test') {
  try {
    validateEnv();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

const app = express();
const httpServer = http.createServer(app);
const syncConfig = getSyncConfig();

// Connect to MongoDB
if (process.env.NODE_ENV !== 'test') {
  connectDB()
    .then(() => require('./services/emailQueue').start())
    .then(() => require('./services/bulkEnrollment').recoverInterrupted())
    .catch((error) => console.error('Email queue start failed:', error.message));
}

// ADMS push endpoints for terminals. Mounted before the JSON/urlencoded parsers
// (terminals post plain text). With ADMS_PORT set they get their own listener instead,
// which should be bound to the terminal VLAN interface only (ADMS_HOST).
if (!syncConfig.adms.port) {
  app.use('/iclock', createIclockRouter());
}

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);

// Prometheus Metrics Middleware
app.use(metricsMiddleware);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: 'Too many requests, please try again later',
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/students/bulk', studentBulkRoutes); // before /api/students so /bulk is not read as a SAP ID
app.use('/api/students', studentRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notify', notifyRoutes);
app.use('/api/visitors', visitorRoutes);
app.use('/api/terminals', terminalRoutes);
app.use('/api/hostels', hostelRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/fingerprint', fingerprintRoutes);
app.use('/api/enrollment', enrollmentRoutes);
app.use('/api/access', accessRoutes);
app.use('/api/hosteller', hostellerRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/ai-query', aiQueryRoutes);
app.use('/api/sync', syncRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Prometheus Metrics Endpoint
app.get('/metrics', async (_req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err);
  }
});

// Error handler
app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  startTerminalJobs();
  startHostellerJobs();
  startSyncJobs();
  attachSocketServer(httpServer);
}

const startAdmsListener = () => {
  const { port, host, tlsKeyPath, tlsCertPath } = syncConfig.adms;
  if (!port) return null;
  const admsApp = express();
  admsApp.disable('x-powered-by');
  admsApp.use('/iclock', createIclockRouter());
  admsApp.use((_req, res) => res.status(404).type('text/plain').send('Not Found'));
  const server =
    tlsKeyPath && tlsCertPath
      ? https.createServer({ key: fs.readFileSync(tlsKeyPath), cert: fs.readFileSync(tlsCertPath) }, admsApp)
      : http.createServer(admsApp);
  server.listen(port, host, () => {
    console.log(`ADMS push listener on ${tlsKeyPath ? 'https' : 'http'}://${host}:${port}/iclock`);
  });
  return server;
};

const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'test') {
  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
  startAdmsListener();
}

module.exports = app;
