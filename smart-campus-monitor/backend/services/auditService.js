const AuditLog = require('../models/AuditLog');

const createAuditLog = async ({
  admin = null,
  action,
  entity,
  entityId = null,
  oldValue = null,
  newValue = null,
  ipAddress = '',
}) => {
  if (!action || !entity) {
    return null;
  }

  return AuditLog.create({
    admin: admin?._id || admin || null,
    action,
    entity,
    entityId,
    oldValue,
    newValue,
    ipAddress,
    timestamp: new Date(),
  });
};

module.exports = {
  createAuditLog,
};
