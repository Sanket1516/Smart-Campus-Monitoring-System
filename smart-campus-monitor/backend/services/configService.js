const SystemConfig = require('../models/SystemConfig');

const DEFAULT_CONFIGS = {
  notification_settings: {
    emailOnEntry: true,
    emailOnExit: true,
    emailOnUnauthorized: false,
    emailOnLateReturn: true,
    curfewByHostel: {},
    defaultCurfewTime: '22:00',
    gracePeriodMinutes: 30,
    emailSenderName: 'Smart Campus Monitoring System',
  },
  academic_settings: {
    academicYear: '',
    departments: [],
    semesterStartDate: '',
    semesterEndDate: '',
    holidayCalendar: [],
    sapIdFormatRule: '',
  },
  system_configuration: {
    collegeName: 'Smart Campus Monitoring System',
    collegeLogo: '',
    cloudflareUrl: '',
    timezone: 'Asia/Kolkata',
    dataRetentionMonths: 12,
    maintenanceMode: false,
    maintenanceMessage: '',
  },
};

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const mergeConfigValue = (defaults, value) => {
  if (Array.isArray(defaults)) {
    return Array.isArray(value) ? value : defaults;
  }

  if (!isPlainObject(defaults)) {
    return value === undefined || value === null ? defaults : value;
  }

  const source = isPlainObject(value) ? value : {};
  const merged = { ...defaults };

  for (const [key, defaultValue] of Object.entries(defaults)) {
    merged[key] = mergeConfigValue(defaultValue, source[key]);
  }

  for (const [key, sourceValue] of Object.entries(source)) {
    if (!(key in merged)) {
      merged[key] = sourceValue;
    }
  }

  return merged;
};

const getDefaultConfig = (key) => DEFAULT_CONFIGS[key];

const normalizeConfigValue = (key, value) => {
  const defaults = getDefaultConfig(key);
  return defaults === undefined ? value : mergeConfigValue(defaults, value);
};

const getSystemConfig = async (key, fallback = undefined) => {
  const config = await SystemConfig.findOne({ key }).lean();

  if (!config) {
    if (fallback !== undefined) {
      return fallback;
    }

    return normalizeConfigValue(key, undefined);
  }

  return normalizeConfigValue(key, config.value);
};

const upsertSystemConfig = async ({ key, value, updatedBy = null }) => {
  const normalized = normalizeConfigValue(key, value);
  const updatedAt = new Date();

  const config = await SystemConfig.findOneAndUpdate(
    { key },
    { value: normalized, updatedBy, updatedAt },
    {
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    }
  );

  return config;
};

const getNotificationSettings = async () => getSystemConfig('notification_settings');
const getAcademicSettings = async () => getSystemConfig('academic_settings');
const getSystemConfiguration = async () => getSystemConfig('system_configuration');

const parseCurfewMinutes = (timeString = '22:00') => {
  const [hoursRaw = '22', minutesRaw = '00'] = String(timeString).split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return 22 * 60;
  }

  return hours * 60 + minutes;
};

const getCurfewTimeForHostel = async (hostelId) => {
  const settings = await getNotificationSettings();
  if (hostelId && settings.curfewByHostel?.[String(hostelId)]) {
    return settings.curfewByHostel[String(hostelId)];
  }

  return settings.defaultCurfewTime || '22:00';
};

const isPastCurfew = async (date, hostelId) => {
  const curfewTime = await getCurfewTimeForHostel(hostelId);
  const curfewMinutes = parseCurfewMinutes(curfewTime);
  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  return currentMinutes >= curfewMinutes;
};

const getGracePeriodMinutes = async () => {
  const settings = await getNotificationSettings();
  return Number(settings.gracePeriodMinutes) || 30;
};

const shouldSendEntryExitEmail = async (action) => {
  const settings = await getNotificationSettings();
  if (action === 'entry') return settings.emailOnEntry !== false;
  if (action === 'exit') return settings.emailOnExit !== false;
  return true;
};

const shouldSendLateReturnEmail = async () => {
  const settings = await getNotificationSettings();
  return settings.emailOnLateReturn !== false;
};

const getEmailSenderName = async () => {
  const settings = await getNotificationSettings();
  return settings.emailSenderName || DEFAULT_CONFIGS.notification_settings.emailSenderName;
};

module.exports = {
  DEFAULT_CONFIGS,
  getDefaultConfig,
  getSystemConfig,
  upsertSystemConfig,
  getNotificationSettings,
  getAcademicSettings,
  getSystemConfiguration,
  getCurfewTimeForHostel,
  isPastCurfew,
  getGracePeriodMinutes,
  shouldSendEntryExitEmail,
  shouldSendLateReturnEmail,
  getEmailSenderName,
  normalizeConfigValue,
};
