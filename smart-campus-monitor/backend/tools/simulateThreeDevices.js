#!/usr/bin/env node
/**
 * SIMULATION MODE: run three fake X990 terminals (ADMIN_ENROLLMENT, GATE_ENTRY, GATE_EXIT)
 * against a running backend, so the whole workflow can be used in the web UI without hardware.
 *
 * Every terminal registered by --seed is marked simulated=true; the backend labels all of its
 * data SIMULATED and never sends simulated templates to real terminals. The backend must run
 * with SIMULATION_MODE=true (refused when NODE_ENV=production).
 *
 *   node tools/simulateThreeDevices.js --seed                 # register SIM-ENR / SIM-ENTRY / SIM-EXIT (uses MONGO_URI)
 *   node tools/simulateThreeDevices.js --url http://127.0.0.1:5000 [--interval 3000] [--auto-capture]
 *
 * Interactive commands (stdin):  entry <PIN> | exit <PIN> | capture <PIN> [finger]
 *                                offline <entry|exit|enr> | online <entry|exit|enr> | status | quit
 */
require('dotenv').config();
const readline = require('readline');
const { FakeTerminal } = require('./fakeTerminal');

const args = process.argv.slice(2);
const has = (flag) => args.includes(`--${flag}`);
const opt = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

const DEVICES = {
  enr: { sn: opt('enr-sn', 'SIM-ENR'), machineNumber: 50, deviceRole: 'ADMIN_ENROLLMENT', label: 'SIMULATED Admin Enrollment' },
  entry: { sn: opt('entry-sn', 'SIM-ENTRY'), machineNumber: 901, deviceRole: 'GATE_ENTRY', label: 'SIMULATED Gate Entry' },
  exit: { sn: opt('exit-sn', 'SIM-EXIT'), machineNumber: 902, deviceRole: 'GATE_EXIT', label: 'SIMULATED Gate Exit' },
};

const seed = async () => {
  const mongoose = require('mongoose');
  const TerminalConfig = require('../models/TerminalConfig');
  await mongoose.connect(process.env.MONGO_URI);
  for (const [key, device] of Object.entries(DEVICES)) {
    const existing = await TerminalConfig.findOne({ $or: [{ deviceSN: device.sn }, { machineNumber: device.machineNumber }] });
    if (existing) {
      console.log(`exists: ${existing.deviceSN} (${existing.deviceRole}) simulated=${existing.simulated}`);
      continue;
    }
    await TerminalConfig.create({
      machineNumber: device.machineNumber,
      deviceSN: device.sn,
      gateName: key === 'enr' ? 'Admin Office (SIMULATED)' : 'Simulated Gate',
      terminalLabel: device.label,
      terminalType: key === 'enr' ? 'ENROLLMENT' : 'MAIN_GATE',
      deviceRole: device.deviceRole,
      simulated: true,
      location: 'SIMULATED',
    });
    console.log(`registered SIMULATED ${device.deviceRole}: ${device.sn}`);
  }
  await mongoose.disconnect();
};

const run = async () => {
  const baseUrl = opt('url', 'http://127.0.0.1:5000');
  const interval = Number(opt('interval', 3000));
  const autoCapture = has('auto-capture');
  const log = (msg) => console.log(`[SIMULATED ${new Date().toISOString()}] ${msg}`);
  const terminals = Object.fromEntries(
    Object.entries(DEVICES).map(([key, d]) => [key, new FakeTerminal({ baseUrl, sn: d.sn, log: (m) => log(`${d.sn} ${m}`) })])
  );
  const offline = new Set();

  for (const [key, terminal] of Object.entries(terminals)) {
    const res = await terminal.handshake();
    if (res.status !== 200) {
      console.error(`${DEVICES[key].sn}: handshake HTTP ${res.status}. Run --seed and start the backend with SIMULATION_MODE=true.`);
      process.exit(1);
    }
  }

  const tick = async () => {
    for (const [key, terminal] of Object.entries(terminals)) {
      if (offline.has(key)) continue;
      try {
        const { results } = await terminal.poll();
        if (key === 'enr' && autoCapture) {
          for (const r of results) {
            const match = /^DATA UPDATE (?:USERINFO PIN|user .*?Pin)=(\d+)/.exec(r.command);
            if (match && r.returnCode === 0 && !terminal.templates.has(`${match[1]}:0`)) {
              setTimeout(() => terminal.enrolOnMenu(match[1], 0).then(() => log(`auto-captured SIMULATED finger for PIN ${match[1]}`)), 2000);
            }
          }
        }
      } catch (error) {
        log(`${DEVICES[key].sn} poll failed: ${error.message}`);
      }
    }
  };
  setInterval(tick, interval);
  log(`three SIMULATED terminals polling ${baseUrl} every ${interval} ms${autoCapture ? ' (auto-capture on)' : ''}`);

  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', async (line) => {
    const [cmd, a, b] = line.trim().split(/\s+/);
    try {
      if (cmd === 'entry' || cmd === 'exit') log(`punch ${cmd} PIN ${a}: HTTP ${(await terminals[cmd].punch(a)).status}`);
      else if (cmd === 'capture') log(`capture PIN ${a}: HTTP ${(await terminals.enr.enrolOnMenu(a, Number(b || 0))).status}`);
      else if (cmd === 'offline') offline.add(a) && log(`${a} is now offline`);
      else if (cmd === 'online') offline.delete(a) && log(`${a} is back online`);
      else if (cmd === 'status') {
        Object.entries(terminals).forEach(([key, t]) =>
          log(`${DEVICES[key].sn}: users=${Array.from(t.users.keys()).join(',') || '-'} fingers=${Array.from(t.templates.keys()).join(',') || '-'}${offline.has(key) ? ' OFFLINE' : ''}`)
        );
      } else if (cmd === 'quit') process.exit(0);
      else log('commands: entry <PIN> | exit <PIN> | capture <PIN> [finger] | offline|online <enr|entry|exit> | status | quit');
    } catch (error) {
      log(`error: ${error.message}`);
    }
  });
};

(has('seed') ? seed() : run()).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
