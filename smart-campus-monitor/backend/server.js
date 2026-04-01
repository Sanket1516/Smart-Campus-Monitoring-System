require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// Route imports
const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/students');
const scanRoutes = require('./routes/scan');
const logRoutes = require('./routes/logs');
const dashboardRoutes = require('./routes/dashboard');
const notifyRoutes = require('./routes/notify');
const visitorRoutes = require('./routes/visitors');
const terminalRoutes = require('./routes/terminals');
const hostelRoutes = require('./routes/hostels');
const alertRoutes = require('./routes/alerts');
const { startTerminalJobs } = require('./jobs/terminalJobs');
const { attachSocketServer } = require('./socket');

const app = express();
const httpServer = http.createServer(app);

// Connect to MongoDB
connectDB();

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);

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
app.use('/api/students', studentRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notify', notifyRoutes);
app.use('/api/visitors', visitorRoutes);
app.use('/api/terminals', terminalRoutes);
app.use('/api/hostels', hostelRoutes);
app.use('/api/alerts', alertRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use(errorHandler);

startTerminalJobs();
attachSocketServer(httpServer);

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
});
