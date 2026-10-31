#!/usr/bin/env node
/**
 * One-off migration to the terminal-sync model.
 *
 *  1. Moves legacy Student.fingerprintTemplate (AES-256-CBC with FP_SECRET) into
 *     BiometricTemplate (AES-256-GCM with TEMPLATE_ENC_KEY) as finger 0, then removes
 *     the legacy field.
 *  2. Sets Student.fingerprintStatus from the stored templates.
 *  3. Reports legacy DeviceAllocation rows whose localUserId differs from the student's
 *     global PIN (zktUserID); with --requeue the legacy device users are deleted first,
 *     students are re-provisioned under the global PIN and the allocations removed.
 *
 * Usage:  node scripts/migrateLegacyTemplates.js [--dry-run] [--keep-legacy] [--requeue]
 *
 * VERIFY ON HARDWARE: legacy templates were read with node-zklib CMD_USERTEMP_RRQ and
 * stripped of an 8-byte header; whether those bytes equal what the X990 accepts over
 * push/pyzk must be confirmed in the pilot before relying on migrated templates.
 */
require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');
const Student = require('../models/Student');
const DeviceAllocation = require('../models/DeviceAllocation');
const BiometricTemplate = require('../models/BiometricTemplate');
const { parseTemplateKey } = require('../services/sync/templateCrypto');
const { storeTemplate } = require('../services/sync/templateStore');
const { recordBiometricAudit } = require('../services/sync/biometricAudit');

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const KEEP_LEGACY = args.has('--keep-legacy');
const REQUEUE = args.has('--requeue');

const legacyDecrypt = (value) => {
  if (!process.env.FP_SECRET) throw new Error('FP_SECRET is required to read legacy templates');
  const key = crypto.createHash('sha256').update(String(process.env.FP_SECRET)).digest();
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  if (!trimmed.includes(':')) return Buffer.from(trimmed, 'base64');
  const [ivValue, encryptedValue] = trimmed.split(':');
  const iv = ivValue.length === 32 ? Buffer.from(ivValue, 'hex') : Buffer.from(ivValue, 'base64');
  const encrypted =
    /^[0-9a-f]+$/i.test(encryptedValue) && encryptedValue.length % 2 === 0
      ? Buffer.from(encryptedValue, 'hex')
      : Buffer.from(encryptedValue, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
};

const main = async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  parseTemplateKey(process.env.TEMPLATE_ENC_KEY);
  await mongoose.connect(process.env.MONGO_URI);
  const report = { legacyTemplates: 0, migrated: 0, failed: 0, statusUpdated: 0, allocationMismatches: 0, requeued: 0 };

  const legacy = await Student.find({ fingerprintTemplate: { $nin: [null, ''] } }).select('+fingerprintTemplate name sapId zktUserID');
  report.legacyTemplates = legacy.length;
  for (const student of legacy) {
    try {
      const bytes = legacyDecrypt(student.fingerprintTemplate);
      if (!bytes?.length) throw new Error('empty template');
      if (!student.zktUserID) throw new Error('student has no zktUserID');
      if (!DRY_RUN) {
        await storeTemplate({
          student,
          pin: String(student.zktUserID),
          fingerIndex: 0,
          flag: 1,
          sizeReported: null,
          template: bytes.toString('base64'),
          sourceTerminal: 'legacy-migration',
          channel: 'migration',
          dialect: 'zk_tcp',
          actor: 'migration',
        });
        if (!KEEP_LEGACY) await Student.updateOne({ _id: student._id }, { $unset: { fingerprintTemplate: 1 } });
      }
      report.migrated += 1;
    } catch (error) {
      report.failed += 1;
      console.error(`  ! ${student.sapId}: ${error.message}`);
    }
  }

  const withTemplates = new Set((await BiometricTemplate.distinct('student')).map(String));
  const students = await Student.find({ isActive: true }).select('_id fingerprintStatus fingerprintEnrolled zktUserID accessStatus');
  for (const student of students) {
    const status = withTemplates.has(String(student._id)) ? 'enrolled' : 'awaiting';
    if (student.fingerprintStatus !== status) {
      report.statusUpdated += 1;
      if (!DRY_RUN) await Student.updateOne({ _id: student._id }, { $set: { fingerprintStatus: status } });
    }
  }

  const allocations = await DeviceAllocation.find().populate('studentId', 'zktUserID').lean();
  const mismatched = allocations.filter((a) => a.studentId && Number(a.localUserId) !== Number(a.studentId.zktUserID));
  report.allocationMismatches = mismatched.length;

  if (REQUEUE && !DRY_RUN) {
    const { enqueueProvision } = require('../services/sync/terminalSyncService');
    const { enqueueCommand } = require('../services/sync/commandQueue');
    const TerminalConfig = require('../models/TerminalConfig');
    // Delete every legacy device-local user first. These commands carry no student
    // (so a later provision cannot cancel them) and USER_DELETE has a higher queue
    // priority than USER_CREATE, so the old finger can never match a new PIN.
    const terminalsById = new Map((await TerminalConfig.find().lean()).map((t) => [String(t._id), t]));
    for (const allocation of mismatched) {
      const terminal = terminalsById.get(String(allocation.deviceId));
      if (!terminal) continue;
      const pin = String(allocation.localUserId);
      await enqueueCommand({ terminal, type: 'USER_DELETE', pin, params: { pin }, dedupeSuffix: `legacy:${pin}`, jobId: 'migration' });
    }
    for (const student of students) {
      if (student.accessStatus === 'blocked') continue;
      const result = await enqueueProvision(student._id, { actor: 'migration', reason: 'resync' });
      if (!result.skipped) report.requeued += 1;
    }
    await DeviceAllocation.deleteMany({});
  }

  await recordBiometricAudit({ actor: 'migration', action: 'migration', details: { ...report, dryRun: DRY_RUN } });
  console.log(JSON.stringify({ dryRun: DRY_RUN, ...report }, null, 2));
  if (mismatched.length && !REQUEUE) {
    console.log(
      `\n${mismatched.length} legacy allocation(s) use a device-local ID different from the global PIN. ` +
        'Old users stay on terminals under their old IDs until you re-run with --requeue and reconcile.'
    );
  }
  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error(error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
