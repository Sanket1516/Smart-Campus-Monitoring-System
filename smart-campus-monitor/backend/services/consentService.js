const ConsentRecord = require('../models/ConsentRecord');
const { getBiometricConfig } = require('../config/biometricConfig');

// True when the student has a consent record that has not been withdrawn, or when
// BIOMETRIC_REQUIRE_CONSENT is off.
const hasActiveConsent = async (student) => {
  if (!getBiometricConfig().consent.required) {
    return true;
  }

  if (!student?.consentRef) {
    return false;
  }

  return Boolean(await ConsentRecord.exists({ _id: student.consentRef, withdrawnAt: null }));
};

module.exports = {
  hasActiveConsent,
};
