const TerminalConfig = require('../models/TerminalConfig');
const { evaluateScan, markTerminalSeen } = require('../services/scanDecisionService');

// POST /api/fingerprint/scan
exports.processFingerprintScan = async (req, res) => {
  try {
    const {
      deviceSN,
      deviceName = '',
      machineNumber,
      userId,
      timestamp,
      verifyMode,
    } = req.body;

    const now = timestamp ? new Date(timestamp) : new Date();
    const { response } = await evaluateScan({ deviceSN, deviceName, machineNumber, userId, now, verifyMode });

    return res.json(response);
  } catch (error) {
    console.error('Fingerprint scan failed:', error.message);
    return res.json({ allow: false });
  }
};

// POST /api/fingerprint/heartbeat
exports.processFingerprintHeartbeat = async (req, res) => {
  try {
    const { deviceSN, deviceName = '', machineNumber } = req.body;
    const terminal = await TerminalConfig.findOne({ machineNumber: Number(machineNumber) });

    if (!terminal || terminal.deviceSN !== String(deviceSN)) {
      return res.status(401).json({ message: 'Terminal authentication failed' });
    }

    await markTerminalSeen(terminal, new Date(), deviceName);

    return res.json({
      success: true,
      terminal: {
        machineNumber: terminal.machineNumber,
        terminalLabel: terminal.terminalLabel,
        isOnline: terminal.isOnline,
        lastSeen: terminal.lastSeen,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
