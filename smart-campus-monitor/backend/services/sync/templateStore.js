/**
 * Encrypted template storage. The template value is kept exactly as the source
 * terminal uploaded it (base64 text); SHA-256 is computed over the decoded bytes.
 */
const BiometricTemplate = require('../../models/BiometricTemplate');
const { encryptTemplate, decryptTemplate, sha256Hex } = require('./templateCrypto');
const { recordBiometricAudit } = require('./biometricAudit');
const { getSyncConfig } = require('../../config/terminalSync');

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

const aadFor = (studentId, fingerIndex) => `${String(studentId)}:${Number(fingerIndex)}`;

const withoutData = (doc) => {
  if (!doc) return doc;
  const { dataIv, dataTag, dataEncrypted, ...meta } = doc;
  return meta;
};

const describeTemplate = (template) => {
  const value = String(template || '').trim();
  if (!value || !BASE64_RE.test(value)) {
    throw new Error('Template is not valid base64');
  }
  const bytes = Buffer.from(value, 'base64');
  if (!bytes.length) throw new Error('Template is empty');
  return { value, bytes, sizeBytes: bytes.length, sizeBase64: value.length, sha256: sha256Hex(bytes) };
};

/**
 * Compare the device-reported Size= with both interpretations (pilot evidence).
 * Returns "bytes" | "base64" | "none" | "unreported".
 */
const classifySizeReported = (sizeReported, described) => {
  if (sizeReported === null || sizeReported === undefined) return 'unreported';
  if (Number(sizeReported) === described.sizeBytes) return 'bytes';
  if (Number(sizeReported) === described.sizeBase64) return 'base64';
  return 'none';
};

const storeTemplate = async ({
  student,
  pin,
  fingerIndex,
  flag = 1,
  sizeReported = null,
  template,
  sourceTerminal = '',
  channel = 'push',
  dialect = 'unknown',
  algorithmVersion = '',
  actor = 'system',
  simulated = false,
}) => {
  const described = describeTemplate(template);
  const studentId = student._id || student;

  // Exact duplicate of another student's template = refuse (likely a wrong PIN on the device).
  // Note: this only detects identical bytes; detecting the same finger enrolled twice needs the
  // device's own duplicate check (UNVERIFIED on X990, see HARDWARE_VERIFICATION.md).
  const duplicate = await BiometricTemplate.findOne({ sha256: described.sha256, student: { $ne: studentId } })
    .select('student fingerIndex')
    .lean();
  if (duplicate) {
    await recordBiometricAudit({
      actor,
      action: 'template_store',
      student,
      terminal: sourceTerminal,
      result: 'rejected_duplicate',
      details: { fingerIndex, sha256: described.sha256, duplicateOf: String(duplicate.student) },
    });
    const error = new Error('This fingerprint template is already stored for another student');
    error.code = 'DUPLICATE_TEMPLATE';
    error.statusCode = 409;
    error.duplicateOf = String(duplicate.student);
    throw error;
  }
  const sizeMatch = classifySizeReported(sizeReported, described);
  const { templateSizeMode } = getSyncConfig().adms;

  if (sizeMatch === 'none' || (sizeMatch !== 'unreported' && sizeMatch !== templateSizeMode)) {
    console.warn(
      `[templates] Size mismatch for PIN ${pin} finger ${fingerIndex}: reported=${sizeReported} ` +
        `bytes=${described.sizeBytes} base64=${described.sizeBase64} mode=${templateSizeMode}`
    );
  }

  const existing = await BiometricTemplate.findOne({ student: studentId, fingerIndex }).lean();
  if (existing && existing.sha256 === described.sha256 && existing.flag === Number(flag) && Boolean(existing.simulated) === Boolean(simulated)) {
    await recordBiometricAudit({
      actor,
      action: 'template_store',
      student,
      terminal: sourceTerminal,
      result: 'unchanged',
      details: { fingerIndex, sha256: described.sha256, sizeBytes: described.sizeBytes, channel },
    });
    return { template: withoutData(existing), changed: false, sizeMatch };
  }

  const encrypted = encryptTemplate(Buffer.from(described.value, 'utf8'), undefined, aadFor(studentId, fingerIndex));
  const doc = await BiometricTemplate.findOneAndUpdate(
    { student: studentId, fingerIndex },
    {
      $set: {
        pin: String(pin),
        flag: Number(flag),
        sizeReported: sizeReported === null || sizeReported === undefined ? null : Number(sizeReported),
        sizeBytes: described.sizeBytes,
        sizeBase64: described.sizeBase64,
        sha256: described.sha256,
        encoding: 'base64',
        dataIv: encrypted.iv,
        dataTag: encrypted.tag,
        dataEncrypted: encrypted.ciphertext,
        keyId: encrypted.keyId,
        sourceTerminal,
        sourceChannel: channel,
        sourceDialect: dialect,
        algorithmVersion,
        aadVersion: 1,
        simulated: Boolean(simulated),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  await recordBiometricAudit({
    actor,
    action: 'template_store',
    student,
    terminal: sourceTerminal,
    details: {
      fingerIndex,
      flag: Number(flag),
      sha256: described.sha256,
      sizeBytes: described.sizeBytes,
      sizeBase64: described.sizeBase64,
      sizeReported,
      sizeMatch,
      channel,
      dialect,
      simulated: Boolean(simulated),
    },
  });

  return { template: withoutData(doc), changed: true, sizeMatch };
};

/** Decrypt a stored template back to the exact uploaded base64 string. Internal use only. */
const loadTemplateValue = async (templateId) => {
  const doc = await BiometricTemplate.findById(templateId)
    .select('+dataIv +dataTag +dataEncrypted')
    .lean();
  if (!doc) return null;
  const aad = doc.aadVersion === 1 ? aadFor(doc.student, doc.fingerIndex) : null;
  const plain = decryptTemplate({ iv: doc.dataIv, tag: doc.dataTag, ciphertext: doc.dataEncrypted }, undefined, aad);
  const value = plain.toString('utf8');
  const check = sha256Hex(Buffer.from(value, 'base64'));
  if (check !== doc.sha256) {
    throw new Error(`Template ${templateId} failed integrity check`);
  }
  return {
    value,
    fingerIndex: doc.fingerIndex,
    flag: doc.flag,
    sha256: doc.sha256,
    sizeBytes: doc.sizeBytes,
    sizeBase64: doc.sizeBase64,
    pin: doc.pin,
    simulated: Boolean(doc.simulated),
  };
};

const listTemplateMeta = (studentId) =>
  BiometricTemplate.find({ student: studentId }).sort({ fingerIndex: 1 }).lean();

const deleteTemplatesForStudent = async (student, actor = 'system') => {
  const docs = await BiometricTemplate.find({ student: student._id || student }).select('fingerIndex sha256').lean();
  const result = await BiometricTemplate.deleteMany({ student: student._id || student });
  await recordBiometricAudit({
    actor,
    action: 'template_delete',
    student,
    details: { deleted: result.deletedCount, fingers: docs.map((d) => d.fingerIndex) },
  });
  return result.deletedCount;
};

module.exports = {
  aadFor,
  describeTemplate,
  classifySizeReported,
  storeTemplate,
  loadTemplateValue,
  listTemplateMeta,
  deleteTemplatesForStudent,
};
