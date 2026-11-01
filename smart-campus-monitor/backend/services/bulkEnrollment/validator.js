const Student = require('../../models/Student');
const { COURSE_OPTIONS, getDepartmentOptions, normalizeCourse, normalizeDepartment } = require('../../utils/studentMeta');
const { getBulkConfig } = require('./config');
const { SAMPLE_SAP_ID } = require('./columns');

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/;
const NAME = /^[\p{L}][\p{L}\p{M}\s.'’-]*$/u;
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const compact = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

// "Day Scholar", "day_scholars", "HOSTELLER" ... all understood; anything else is reported, never guessed.
const toCategory = (value) => {
  const letters = String(value ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (letters === 'dayscholar' || letters === 'dayscholars') return 'dayscholars';
  if (letters === 'hosteller' || letters === 'hostellers') return 'hostellers';
  return '';
};

const toPhone = (value) => String(value ?? '').replace(/[\s().-]/g, '');

/**
 * Validates one spreadsheet row against the real Student schema and business rules.
 * `hostels` is a Map of lowercase hostel name/code -> { _id, name }.
 * Returns { data, issues } where data is ready for insertion when there are no `error` issues.
 */
const validateStudentRow = (values, { hostels = new Map() } = {}) => {
  const { sapIdPattern } = getBulkConfig();
  const issues = [];
  const error = (field, message) => issues.push({ severity: 'error', field, message });
  const warn = (field, message) => issues.push({ severity: 'warning', field, message });

  const sapId = String(values.sapId ?? '').trim();
  const name = compact(values.name);
  const email = compact(values.email).toLowerCase();
  const category = toCategory(values.category);
  const course = normalizeCourse(values.course);
  const department = normalizeDepartment(compact(values.department));
  const yearText = compact(values.year);
  const phone = toPhone(values.phone);
  const parentEmail = compact(values.parentEmail).toLowerCase();
  const parentPhone = toPhone(values.parentPhone);
  const address = compact(values.address);
  const bloodGroup = compact(values.bloodGroup).toUpperCase();
  const hostelText = compact(values.hostel);
  const roomNumber = compact(values.roomNumber);

  // ── Identity ────────────────────────────────────────────────────────────
  if (!sapId) error('sapId', 'SAP ID is required');
  else if (!new RegExp(`^(?:${sapIdPattern})$`).test(sapId)) error('sapId', `SAP ID "${sapId}" is not valid (expected ${sapIdPattern})`);
  else if (sapId === SAMPLE_SAP_ID) error('sapId', 'This is the sample row from the template. Delete it or replace it with a real student');

  if (!name) error('name', 'Student name is required');
  else if (name.length < 2 || name.length > 100) error('name', 'Name must be 2 to 100 characters');
  else if (!NAME.test(name)) error('name', 'Name contains invalid characters');

  if (!email) error('email', 'Student email is required');
  else if (email.length > 254 || !EMAIL.test(email)) error('email', `Invalid email address "${email}"`);

  // ── Academic ────────────────────────────────────────────────────────────
  if (!values.category || !String(values.category).trim()) error('category', 'Category is required (dayscholars or hostellers)');
  else if (!category) error('category', `Invalid category "${compact(values.category)}". Use dayscholars or hostellers`);

  if (!course) error('course', 'Course is required');
  else if (!COURSE_OPTIONS.includes(course)) error('course', `Invalid course "${course}". Use one of: ${COURSE_OPTIONS.join(', ')}`);

  if (!department) error('department', 'Department is required');
  else if (COURSE_OPTIONS.includes(course) && !getDepartmentOptions(course).includes(department)) {
    error('department', `Department "${department}" does not belong to course "${course}". Allowed: ${getDepartmentOptions(course).join(', ')}`);
  }

  let year;
  if (yearText) {
    year = Number(yearText);
    if (!Number.isInteger(year) || year < 1 || year > 5) {
      error('year', `Year must be a whole number from 1 to 5 (got "${yearText}")`);
      year = undefined;
    }
  }

  // ── Contact ─────────────────────────────────────────────────────────────
  if (phone && !/^\+?\d{10,15}$/.test(phone)) error('phone', `Invalid mobile number "${compact(values.phone)}"`);
  if (parentPhone && !/^\+?\d{10,15}$/.test(parentPhone)) error('parentPhone', `Invalid parent mobile number "${compact(values.parentPhone)}"`);
  if (parentEmail && (parentEmail.length > 254 || !EMAIL.test(parentEmail))) error('parentEmail', `Invalid parent email "${parentEmail}"`);
  if (!parentEmail && !parentPhone) warn('parentEmail', 'No parent email or phone: entry/exit notifications cannot reach the parent');
  if (address.length > 300) error('address', 'Address is longer than 300 characters');
  if (bloodGroup && !BLOOD_GROUPS.includes(bloodGroup)) warn('bloodGroup', `Unrecognised blood group "${bloodGroup}" (left blank)`);

  // ── Hostel rules ────────────────────────────────────────────────────────
  let hostelId;
  let finalRoom = '';
  if (category === 'hostellers') {
    if (!hostelText) {
      error('hostel', 'Hostel is required for hostellers (warden approval is routed through it)');
    } else {
      const match = hostels.get(hostelText.toLowerCase());
      if (!match) error('hostel', `Hostel "${hostelText}" is not registered. Check the Lists sheet in the template`);
      else hostelId = match._id;
    }
    if (roomNumber.length > 20) error('roomNumber', 'Room number is longer than 20 characters');
    else finalRoom = roomNumber;
    if (!roomNumber) warn('roomNumber', 'No room number given');
  } else if (category === 'dayscholars' && (hostelText || roomNumber)) {
    warn('hostel', 'Hostel details are ignored for day scholars');
  }

  const isHosteller = category === 'hostellers';
  const data = {
    sapId,
    name,
    email,
    category,
    course,
    department,
    ...(year !== undefined ? { year } : {}),
    ...(phone ? { phone } : {}),
    ...(parentEmail ? { parentEmail } : {}),
    ...(parentPhone ? { parentPhone } : {}),
    address,
    bloodGroup: BLOOD_GROUPS.includes(bloodGroup) ? bloodGroup : '',
    studentType: isHosteller ? 'hosteller' : 'day_scholar',
    isHosteller,
    wardenApprovalRequired: isHosteller,
    ...(isHosteller && hostelId ? { hostel: hostelId } : {}),
    roomNumber: finalRoom,
    // Same starting state the previous Excel import used: awaiting fingerprint enrolment on the terminals.
    fingerprintStatus: 'awaiting',
  };

  // Last line of defence: the actual Mongoose schema (types, enums, min/max). The async pre-validate hook
  // (department vs course) is covered above because validateSync does not run hooks.
  if (!issues.some((issue) => issue.severity === 'error')) {
    const schemaError = new Student(data).validateSync();
    if (schemaError) {
      Object.values(schemaError.errors).forEach((fieldError) => error(fieldError.path, fieldError.message));
    }
  }

  return { data, issues };
};

module.exports = { validateStudentRow, toCategory };
