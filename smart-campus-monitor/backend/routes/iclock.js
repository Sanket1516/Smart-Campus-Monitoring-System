/**
 * ADMS / iclock push endpoints. Mounted at /iclock, separate from /api, with its own
 * security: terminal IP allow-list (ADMS_ALLOWED_CIDRS) AND a registered serial number.
 * ADMS has no real authentication; keep this endpoint on the terminal VLAN/VPN only.
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const { getSyncConfig } = require('../config/terminalSync');
const { createIpMatcher, normalizeIp } = require('../services/adms/ipFilter');
const adms = require('../services/adms/admsService');

const plain = (res, status, text) => res.status(status).type('text/plain').send(text);

const createIclockRouter = () => {
  const config = getSyncConfig().adms;
  const router = express.Router();
  const isProduction = process.env.NODE_ENV === 'production';
  const cidrs = config.allowedCidrs.length
    ? config.allowedCidrs
    : isProduction
      ? []
      : ['127.0.0.0/8', '::1/128', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'];
  const ipAllowed = createIpMatcher(cidrs);

  router.use(express.text({ type: () => true, limit: config.bodyLimit }));

  router.use((req, res, next) => {
    const ip = normalizeIp(
      config.trustProxy ? String(req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket.remoteAddress : req.socket.remoteAddress
    );
    req.terminalIp = ip;
    if (!ipAllowed(ip)) {
      if (process.env.NODE_ENV !== 'test') console.warn(`[adms] refused ${req.method} ${req.path} from non-terminal IP ${ip}`);
      return plain(res, 403, 'Forbidden');
    }
    return next();
  });

  router.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: config.rateLimitPerMinute,
      keyGenerator: (req) => `${req.terminalIp}|${req.query.SN || ''}`,
      standardHeaders: false,
      legacyHeaders: false,
      validate: false,
      handler: (_req, res) => plain(res, 429, 'Too Many Requests'),
    })
  );

  const withTerminal = (handler) => async (req, res) => {
    try {
      const { terminal, error } = await adms.findRegisteredTerminal(req.query.SN, req.terminalIp);
      if (!terminal) return plain(res, error === 'missing SN' ? 400 : 403, error === 'missing SN' ? 'SN required' : 'Unknown device');
      return await handler(req, res, terminal);
    } catch (error) {
      console.error(`[adms] ${req.method} ${req.path} failed:`, error.message);
      return plain(res, 500, 'ERROR');
    }
  };

  router.get(
    '/cdata',
    withTerminal(async (req, res, terminal) => {
      if (req.query.options !== undefined) {
        return plain(res, 200, await adms.handleHandshake(terminal, req.query, req.terminalIp));
      }
      return plain(res, 200, 'OK');
    })
  );

  router.post(
    '/cdata',
    withTerminal(async (req, res, terminal) => {
      await adms.handleCdataPost(terminal, req.query, typeof req.body === 'string' ? req.body : '', req.terminalIp);
      return plain(res, 200, 'OK');
    })
  );

  router.get(
    '/getrequest',
    withTerminal(async (req, res, terminal) => plain(res, 200, await adms.handleGetRequest(terminal, req.query, req.terminalIp)))
  );

  router.post(
    '/devicecmd',
    withTerminal(async (req, res, terminal) => {
      await adms.handleDeviceCmd(terminal, typeof req.body === 'string' ? req.body : '', req.terminalIp);
      return plain(res, 200, 'OK');
    })
  );

  // Log anything else a terminal calls (e.g. v3 /iclock/registry, /iclock/push) for the pilot.
  router.all('*', (req, res) => {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(`[adms] unhandled ${req.method} /iclock${req.path} SN=${req.query.SN || '-'} from ${req.terminalIp}`);
    }
    return plain(res, 404, 'Not Found');
  });

  return router;
};

module.exports = { createIclockRouter };
