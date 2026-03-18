const CATEGORY_ALIASES = {
  dayscholars: ['dayscholars', 'day_scholar'],
  hostellers: ['hostellers', 'hosteller'],
};

const COURSE_OPTIONS = ['pharmacy', 'engineering', 'mbatech', 'pharmatech'];

const DEPARTMENT_OPTIONS = {
  pharmacy: ['bpharm'],
  engineering: ['cs', 'ce'],
  mbatech: ['mbatech'],
  pharmatech: ['pharmatech'],
};

const normalizeCategory = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (CATEGORY_ALIASES.dayscholars.includes(normalized)) return 'dayscholars';
  if (CATEGORY_ALIASES.hostellers.includes(normalized)) return 'hostellers';
  return normalized;
};

const normalizeCourse = (value) => String(value || '').trim().toLowerCase();

const normalizeDepartment = (value) => String(value || '').trim().toLowerCase();

const getDepartmentOptions = (course) => DEPARTMENT_OPTIONS[normalizeCourse(course)] || [];

const isHosteller = (category) => CATEGORY_ALIASES.hostellers.includes(normalizeCategory(category));

module.exports = {
  CATEGORY_ALIASES,
  COURSE_OPTIONS,
  DEPARTMENT_OPTIONS,
  normalizeCategory,
  normalizeCourse,
  normalizeDepartment,
  getDepartmentOptions,
  isHosteller,
};
