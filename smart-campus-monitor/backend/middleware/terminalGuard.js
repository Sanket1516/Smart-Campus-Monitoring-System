const rateLimit = require('express-rate-limit');
const TerminalConfig = require('../models/TerminalConfig');
const AlertLog = require('../models/AlertLog');
const { emitUnknownTerminal } = require('../services/socketService');
const { getBiometricConfig } = require('../config/biometricConfig');

// ADMS has no real authentication: terminals identify themselves by serial number only.
// This guard narrows that down to known networks AND registered, enabled serials.

const normalizeIp = (ip = '') => String(ip).replace(/^::ffff:/, '');

const ipv4ToInt = (ip) => {
  const parts = ip.split('.').map(Number);

  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }

  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
};

const ipInCidr = (ip, cidr) => {
  const [base, bitsText = '32'] = cidr.split('/');
  const bits = Number(bitsText);
  const ipValue = ipv4ToInt(normalizeIp(ip));
  const baseValue = ipv4ToInt(base);

  if (ipValue === null || baseValue === null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
    return false;
  }

  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipValue & mask) === (baseValue & mask);
};

const isLoopback = (ip) => {
  const value = normalizeIp(ip);
  return value === '::1' || value.startsWith('127.');
};

// No CIDRs configured = loopback only, so a misconfigured server fails closed.
const isAllowedSource = (ip, cidrs) =>
  cidrs.length ? cidrs.some((cidr) => ipInCidr(ip, cidr)) : isLoopback(ip);

// One alert per serial / address per 10 minutes, so a misconfigured unit polling every
// few seconds does not flood the alert log.
const ALERT_INTERVAL_MS = 10 * 60 * 1000;
const lastAlertAt = new Map();

const raiseThrottledAlert = async (key, message, metadata) => {
  const now = Date.now();

  if (now - (lastAlertAt.get(key) || 0) < ALERT_INTERVAL_MS) {
    return;
  }

  lastAlertAt.set(key, now);
  console.warn(`[iclock] ${message}`);

  try {
    await AlertLog.create({ type: 'security', message, metadata });
    emitUnknownTerminal({ ...metadata, time: new Date(now).toISOString() });
  } catch (error) {
    console.error('Failed to record iclock alert:', error.message);
  }
};

const terminalGuard = async (req, res, next) => {
  try {
    const config = getBiometricConfig();
    const ip = normalizeIp(req.ip || req.socket?.remoteAddress);
    const serialNumber = String(req.query.SN || '').trim();

    if (config.adms.requireTls && !req.secure) {
      return res.status(403).type('text/plain').send('TLS required');
    }

    if (!isAllowedSource(ip, config.adms.allowedCidrs)) {
      await raiseThrottledAlert(`ip:${ip}`, `Refused /iclock request from ${ip} (outside ADMS_ALLOWED_CIDRS)`, {
        ip,
        deviceSN: serialNumber,
      });
      return res.status(403).type('text/plain').send('Forbidden');
    }

    if (!serialNumber) {
      return res.status(400).type('text/plain').send('SN required');
    }

    const terminal = await TerminalConfig.findOne({ deviceSN: serialNumber });

    if (!terminal || terminal.enabled === false) {
      await raiseThrottledAlert(
        `sn:${serialNumber}`,
        terminal
          ? `Disabled terminal ${serialNumber} contacted /iclock from ${ip}`
          : `Unregistered terminal ${serialNumber} contacted /iclock from ${ip}`,
        { ip, deviceSN: serialNumber }
      );
      return res.status(403).type('text/plain').send('Unknown terminal');
    }

    if (config.adms.enforceTerminalIp && terminal.terminalIP && normalizeIp(terminal.terminalIP) !== ip) {
      await raiseThrottledAlert(
        `snip:${serialNumber}:${ip}`,
        `Terminal ${serialNumber} contacted /iclock from ${ip}, registered IP is ${terminal.terminalIP}`,
        { ip, deviceSN: serialNumber, registeredIp: terminal.terminalIP }
      );
      return res.status(403).type('text/plain').send('Forbidden');
    }

    req.terminal = terminal;
    req.terminalIp = ip;
    return next();
  } catch (error) {
    console.error('iclock guard failed:', error.message);
    return res.status(500).type('text/plain').send('ERROR');
  }
};

const terminalRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: () => getBiometricConfig().adms.rateLimitPerMinute,
  keyGenerator: (req) => `${String(req.query.SN || '')}|${normalizeIp(req.ip || req.socket?.remoteAddress)}`,
  standardHeaders: false,
  legacyHeaders: false,
  message: 'Too many requests',
});

module.exports = {
  ipInCidr,
  isAllowedSource,
  terminalGuard,
  terminalRateLimit,
};
