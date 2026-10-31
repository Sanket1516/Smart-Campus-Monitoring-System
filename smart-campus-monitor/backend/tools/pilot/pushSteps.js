#!/usr/bin/env node
/**
 * Pilot helper for the push (ADMS) steps. Queues commands for ONE terminal and
 * reports results. Run the server with ADMS_PILOT_LOG set to capture evidence.
 *
 *   node tools/pilot/pushSteps.js probe       --sn SN
 *   node tools/pilot/pushSteps.js push-copy   --sap 5001 --sn SN    (user + stored templates)
 *   node tools/pilot/pushSteps.js query       --sap 5001 --sn SN    (DATA QUERY USERINFO)
 *   node tools/pilot/pushSteps.js query-tpl   --sap 5001 --sn SN    (template query; UNVERIFIED)
 *   node tools/pilot/pushSteps.js delete      --sap 5001 --sn SN
 *   node tools/pilot/pushSteps.js status      --sn SN [--last 20]
 *   node tools/pilot/pushSteps.js punches     --sn SN --since 2026-11-02T09:00:00Z [--expected 50]
 */
require('dotenv').config();
const mongoose = require('mongoose');
const TerminalConfig = require('../../models/TerminalConfig');
const TerminalCommand = require('../../models/TerminalCommand');
const Student = require('../../models/Student');
const AttendancePunch = require('../../models/AttendancePunch');
const { enqueueCommand } = require('../../services/sync/commandQueue');
const { enqueueProvision } = require('../../services/sync/terminalSyncService');
const { getSyncConfig } = require('../../config/terminalSync');

const args = process.argv.slice(2);
const step = args[0];
const opt = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

const stats = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const pick = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return { n: sorted.length, min: sorted[0], p50: pick(0.5), p95: pick(0.95), max: sorted[sorted.length - 1] };
};

const loadTerminal = async () => {
  const terminal = await TerminalConfig.findOne({ deviceSN: opt('sn') }).lean();
  if (!terminal) throw new Error(`Terminal ${opt('sn')} is not registered`);
  return terminal;
};

const loadStudent = async () => {
  const student = await Student.findOne({ sapId: opt('sap') });
  if (!student) throw new Error(`Student ${opt('sap')} not found`);
  if (!student.zktUserID) throw new Error('Student has no PIN yet (provision or start enrolment first)');
  return student;
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const terminal = step === 'punches' || step === 'status' || step === 'probe' ? await loadTerminal() : null;

  switch (step) {
    case 'probe': {
      await TerminalConfig.updateOne({ _id: terminal._id }, { $set: { dialect: 'unknown', dialectSource: '' } });
      const { command } = await enqueueCommand({ terminal, type: 'PROBE', params: { pin: getSyncConfig().adms.probePin }, dedupeSuffix: 'classic', dialectName: 'classic' });
      return { queued: command.cmdId, text: command.text };
    }
    case 'push-copy': {
      const t = await loadTerminal();
      const student = await loadStudent();
      return enqueueProvision(student, { terminals: [t], reason: 'resync', actor: 'pilot' });
    }
    case 'query':
    case 'query-tpl':
    case 'delete': {
      const t = await loadTerminal();
      const student = await loadStudent();
      const pin = String(student.zktUserID);
      const type = step === 'query' ? 'USER_QUERY' : step === 'delete' ? 'USER_DELETE' : 'TEMPLATE_QUERY';
      const { command, created } = await enqueueCommand({ terminal: t, type, student, pin, params: { pin } });
      return { queued: command.cmdId, created, text: command.text };
    }
    case 'status': {
      const rows = await TerminalCommand.find({ terminalSN: terminal.deviceSN })
        .sort({ cmdId: -1 })
        .limit(Number(opt('last', 20)))
        .select('cmdId type status attempts returnCode lastError pin text sentAt ackedAt')
        .lean();
      return {
        terminal: { sn: terminal.deviceSN, dialect: terminal.dialect, pushVersion: terminal.pushVersion, firmware: terminal.firmware, lastSeen: terminal.lastSeen },
        commands: rows.map((r) => ({ ...r, ack_latency_ms: r.sentAt && r.ackedAt ? new Date(r.ackedAt) - new Date(r.sentAt) : null })),
      };
    }
    case 'punches': {
      const since = new Date(opt('since', new Date(Date.now() - 3600 * 1000).toISOString()));
      const punches = await AttendancePunch.find({ terminalSN: terminal.deviceSN, serverReceivedAt: { $gte: since } }).lean();
      const expected = opt('expected') ? Number(opt('expected')) : null;
      return {
        since: since.toISOString(),
        received: punches.length,
        expected,
        missing: expected === null ? null : Math.max(0, expected - punches.length),
        processed: punches.reduce((acc, p) => ({ ...acc, [p.processed]: (acc[p.processed] || 0) + 1 }), {}),
        delivery_latency_ms: stats(punches.filter((p) => p.deviceTime).map((p) => new Date(p.serverReceivedAt) - new Date(p.deviceTime))),
        note: 'Latency uses device time interpreted with ADMS_DEVICE_UTC_OFFSET_MIN; device clock drift is included.',
      };
    }
    default:
      throw new Error(`Unknown step "${step}". See the header of this file.`);
  }
};

run()
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
