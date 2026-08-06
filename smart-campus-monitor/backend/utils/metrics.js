const client = require('prom-client');

// Create a Registry
const register = new client.Registry();

// Add default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({ register });

// 1. Active Terminals Gauge
const activeTerminals = new client.Gauge({
  name: 'smart_campus_active_terminals',
  help: 'Number of active/connected biometric terminals',
});
register.registerMetric(activeTerminals);

// 2. Failed Logins Counter
const failedLogins = new client.Counter({
  name: 'smart_campus_failed_logins_total',
  help: 'Total number of failed login attempts',
  labelNames: ['reason']
});
register.registerMetric(failedLogins);

// 3. Blocked Student Attempts Counter
const blockedStudentAttempts = new client.Counter({
  name: 'smart_campus_blocked_student_attempts_total',
  help: 'Total number of blocked student access/entry attempts',
  labelNames: ['reason', 'terminal_ip']
});
register.registerMetric(blockedStudentAttempts);

// 4. Terminal Health Status Gauge and Heartbeat
const terminalHealthStatus = new client.Gauge({
  name: 'smart_campus_terminal_health_status',
  help: 'Terminal health status (1 = online/healthy, 0 = offline/unhealthy)',
  labelNames: ['terminal_ip', 'name']
});
register.registerMetric(terminalHealthStatus);

const terminalHeartbeat = new client.Gauge({
  name: 'smart_campus_terminal_heartbeat_timestamp_seconds',
  help: 'Epoch timestamp of the last heartbeat received from a terminal',
  labelNames: ['terminal_ip', 'name']
});
register.registerMetric(terminalHeartbeat);

// 5. API Response Histogram
const apiResponseHistogram = new client.Histogram({
  name: 'smart_campus_api_response_duration_seconds',
  help: 'Duration of HTTP responses in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5] // seconds
});
register.registerMetric(apiResponseHistogram);

// Middleware to track response times
const metricsMiddleware = (req, res, next) => {
  const start = process.hrtime();
  
  res.on('finish', () => {
    const duration = process.hrtime(start);
    const durationInSeconds = duration[0] + duration[1] / 1e9;
    
    // Express route path (if available) or path
    const route = req.route ? req.route.path : req.path;
    
    apiResponseHistogram.observe(
      {
        method: req.method,
        route: route || req.baseUrl || req.path,
        status_code: res.statusCode
      },
      durationInSeconds
    );
  });
  
  next();
};

module.exports = {
  register,
  activeTerminals,
  failedLogins,
  blockedStudentAttempts,
  terminalHealthStatus,
  terminalHeartbeat,
  metricsMiddleware
};
