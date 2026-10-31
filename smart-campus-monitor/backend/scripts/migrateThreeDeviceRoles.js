#!/usr/bin/env node
/**
 * Migration for the three-device model. Idempotent; run with --dry-run first.
 *
 *  1. Terminals: set deviceRole (machine 50 → ADMIN_ENROLLMENT, others → GATE_TOGGLE unless
 *     already set), deviceModel, communicationProtocol, simulated=false where missing.
 *  2. Students: enrollmentState / enrollmentDeviceSN from stored templates, then recompute
 *     syncStatus + gateSync from terminal state.
 *  3. Templates without aadVersion (stored before AAD binding) are re-encrypted with AAD.
 *
 * Assign GATE_ENTRY / GATE_EXIT afterwards on the Terminal Sync page (one each).
 *
 *   node scripts/migrateThreeDeviceRoles.js [--dry-run]
 */
require('dotenv').config();
const mongoose = require('mongoose');
const TerminalConfig = require('../models/TerminalConfig');
const Student = require('../models/Student');
const BiometricTemplate = require('../models/BiometricTemplate');
const { encryptTemplate, decryptTemplate, parseTemplateKey } = require('../services/sync/templateCrypto');
const { aadFor } = require('../services/sync/templateStore');
const { recomputeStudentSyncStatus } = require('../services/sync/syncStatus');

const DRY = process.argv.includes('--dry-run');

const main = async () => {
  parseTemplateKey(process.env.TEMPLATE_ENC_KEY);
  await mongoose.connect(process.env.MONGO_URI);
  const report = { terminalsUpdated: 0, templatesRewrapped: 0, studentsUpdated: 0, statusRecomputed: 0 };

  for (const terminal of await TerminalConfig.find().lean()) {
    const set = {};
    if (!terminal.deviceRole) set.deviceRole = terminal.isEnrollmentStation ? 'ADMIN_ENROLLMENT' : 'GATE_TOGGLE';
    if (!terminal.deviceModel) set.deviceModel = 'X990';
    if (!terminal.communicationProtocol) set.communicationProtocol = 'adms_push';
    if (terminal.simulated === undefined) set.simulated = false;
    if (Object.keys(set).length) {
      report.terminalsUpdated += 1;
      if (!DRY) await TerminalConfig.updateOne({ _id: terminal._id }, { $set: set });
    }
  }

  const legacy = await BiometricTemplate.find({ aadVersion: { $exists: false } }).select('+dataIv +dataTag +dataEncrypted').lean();
  for (const doc of legacy) {
    const plain = decryptTemplate({ iv: doc.dataIv, tag: doc.dataTag, ciphertext: doc.dataEncrypted });
    const enc = encryptTemplate(plain, undefined, aadFor(doc.student, doc.fingerIndex));
    report.templatesRewrapped += 1;
    if (!DRY) {
      await BiometricTemplate.updateOne(
        { _id: doc._id },
        { $set: { dataIv: enc.iv, dataTag: enc.tag, dataEncrypted: enc.ciphertext, keyId: enc.keyId, aadVersion: 1, simulated: false } }
      );
    }
  }

  const withTemplates = await BiometricTemplate.aggregate([{ $group: { _id: '$student', source: { $first: '$sourceTerminal' } } }]);
  const sourceByStudent = new Map(withTemplates.map((row) => [String(row._id), row.source]));
  for (const student of await Student.find({ isActive: true }).select('_id enrollmentState enrollmentDeviceSN').lean()) {
    const source = sourceByStudent.get(String(student._id));
    if (source && (!student.enrollmentState || student.enrollmentState === 'idle')) {
      report.studentsUpdated += 1;
      if (!DRY) await Student.updateOne({ _id: student._id }, { $set: { enrollmentState: 'captured', enrollmentDeviceSN: source } });
    }
    if (!DRY) {
      await recomputeStudentSyncStatus(student._id);
      report.statusRecomputed += 1;
    }
  }

  console.log(JSON.stringify({ dryRun: DRY, ...report }, null, 2));
  console.log('Next: assign GATE_ENTRY and GATE_EXIT to one terminal each on the Terminal Sync page.');
  await mongoose.disconnect();
};

main().catch(async (error) => {
  console.error(error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
