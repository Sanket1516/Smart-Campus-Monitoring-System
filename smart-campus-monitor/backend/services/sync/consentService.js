const BiometricConsent = require('../../models/BiometricConsent');
const Student = require('../../models/Student');
const { recordBiometricAudit } = require('./biometricAudit');

const getActiveConsent = async (student) => {
  const consentRef = student?.consentRef;
  if (!consentRef) return null;
  return BiometricConsent.findOne({ _id: consentRef, withdrawnAt: null }).lean();
};

const hasActiveConsent = async (student) => Boolean(await getActiveConsent(student));

const recordConsent = async ({ student, isMinor, givenBy, giverName, giverContact, method, documentRef, noticeVersion, actor }) => {
  const consent = await BiometricConsent.create({
    student: student._id,
    isMinor: Boolean(isMinor),
    givenBy,
    giverName,
    giverContact,
    method,
    documentRef,
    noticeVersion,
    recordedBy: actor?._id || null,
  });
  await Student.updateOne({ _id: student._id }, { $set: { consentRef: consent._id } });
  await recordBiometricAudit({
    actor,
    action: 'consent_record',
    student,
    details: { consentId: String(consent._id), isMinor: Boolean(isMinor), givenBy, method },
  });
  return consent;
};

const withdrawConsent = async ({ student, reason = '', actor }) => {
  if (!student.consentRef) return null;
  const consent = await BiometricConsent.findOneAndUpdate(
    { _id: student.consentRef, withdrawnAt: null },
    { $set: { withdrawnAt: new Date(), withdrawnReason: reason } },
    { new: true }
  ).lean();
  await recordBiometricAudit({
    actor,
    action: 'consent_withdraw',
    student,
    details: { consentId: String(student.consentRef), reason },
  });
  return consent;
};

module.exports = { getActiveConsent, hasActiveConsent, recordConsent, withdrawConsent };
