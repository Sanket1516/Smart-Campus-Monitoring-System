// Single source of truth for the bulk-enrollment spreadsheet. The template, the parser, the validator and
// the instructions sheet are all generated from this list, so they can never drift apart.
// Field names are the real Student schema fields (no invented ones).
const { COURSE_OPTIONS, DEPARTMENT_OPTIONS } = require('../../utils/studentMeta');

const CATEGORY_VALUES = ['dayscholars', 'hostellers'];

const COLUMNS = [
  { key: 'sapId', header: 'sapId', required: true, width: 16, text: true, example: '70552600099',
    help: 'Student SAP ID: 9 to 11 digits. Keep it as text so leading zeros survive.' },
  { key: 'name', header: 'name', required: true, width: 26, example: 'Demo Student',
    help: 'Full name (letters, spaces, . \' -).' },
  { key: 'email', header: 'email', required: true, width: 30, example: 'demo.student@example.com',
    help: 'Student email address.' },
  { key: 'category', header: 'category', required: true, width: 14, example: 'dayscholars',
    help: `One of: ${CATEGORY_VALUES.join(', ')}. ("day scholar" / "hosteller" are also understood.)` },
  { key: 'course', header: 'course', required: true, width: 14, example: 'engineering',
    help: `One of: ${COURSE_OPTIONS.join(', ')}.` },
  { key: 'department', header: 'department', required: true, width: 22, example: 'computer science',
    help: Object.entries(DEPARTMENT_OPTIONS).map(([course, list]) => `${course}: ${list.join(' / ')}`).join('; ') },
  { key: 'year', header: 'year', required: false, width: 8, example: 2, help: 'Academic year, 1 to 5.' },
  { key: 'phone', header: 'phone', required: false, width: 16, text: true, example: '9876543210',
    help: 'Student mobile number (10 to 15 digits, optional + prefix).' },
  { key: 'parentEmail', header: 'parentEmail', required: false, width: 30, example: 'parent@example.com',
    help: 'Parent email. Entry/exit notifications are emailed here, so fill it in.' },
  { key: 'parentPhone', header: 'parentPhone', required: false, width: 16, text: true, example: '9876543211',
    help: 'Parent mobile number (10 to 15 digits).' },
  { key: 'address', header: 'address', required: false, width: 30, example: '', help: 'Home address (max 300 characters).' },
  { key: 'bloodGroup', header: 'bloodGroup', required: false, width: 12, example: 'O+', help: 'A+, A-, B+, B-, AB+, AB-, O+ or O-.' },
  { key: 'hostel', header: 'hostel', required: false, width: 22, example: '',
    help: 'REQUIRED for hostellers: the hostel name or code exactly as registered. Leave empty for day scholars.' },
  { key: 'roomNumber', header: 'roomNumber', required: false, width: 12, text: true, example: '',
    help: 'Hostel room number (hostellers only, optional).' },
];

// "Parent Email", "parent_email" and "PARENTEMAIL" all map to the same column.
const headerKey = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const ALIASES = {
  sapid: 'sapId', sapno: 'sapId', sapnumber: 'sapId',
  studentname: 'name', fullname: 'name',
  emailid: 'email', studentemail: 'email',
  type: 'category', studenttype: 'category', studentcategory: 'category',
  program: 'course', programme: 'course',
  dept: 'department', branch: 'department',
  academicyear: 'year',
  mobile: 'phone', phonenumber: 'phone', mobilenumber: 'phone',
  parentemailid: 'parentEmail', guardianemail: 'parentEmail',
  parentmobile: 'parentPhone', parentphonenumber: 'parentPhone', guardianphone: 'parentPhone',
  hostelname: 'hostel',
  room: 'roomNumber', roomno: 'roomNumber',
};

const HEADER_TO_KEY = new Map();
COLUMNS.forEach((column) => HEADER_TO_KEY.set(headerKey(column.key), column.key));
Object.entries(ALIASES).forEach(([alias, key]) => HEADER_TO_KEY.set(alias, key));

const SAMPLE_SAP_ID = COLUMNS[0].example;

module.exports = { COLUMNS, CATEGORY_VALUES, headerKey, HEADER_TO_KEY, SAMPLE_SAP_ID };
