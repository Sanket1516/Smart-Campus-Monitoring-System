const express = require('express');
const { handshake, upload, poll, commandResult, ping } = require('../controllers/iclockController');
const { terminalGuard, terminalRateLimit } = require('../middleware/terminalGuard');
const { getBiometricConfig } = require('../config/biometricConfig');

// Mounted at /iclock, before the JSON / urlencoded parsers: terminals send plain text
// bodies, sometimes with a form content type.
const router = express.Router();

router.use(express.text({ type: () => true, limit: getBiometricConfig().adms.bodyLimit }));
router.use(terminalRateLimit);
router.use(terminalGuard);

router.get('/cdata', handshake);
router.post('/cdata', upload);
router.get('/getrequest', poll);
router.post('/devicecmd', commandResult);
router.get('/ping', ping);

module.exports = router;
