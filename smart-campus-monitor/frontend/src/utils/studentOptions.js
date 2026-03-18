export const CATEGORY_OPTIONS = [
  { value: 'dayscholars', label: 'Dayscholars' },
  { value: 'hostellers', label: 'Hostellers' },
];

export const COURSE_OPTIONS = [
  { value: 'engineering', label: 'Engineering' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'mbatech', label: 'MBA Tech' },
  { value: 'pharmatech', label: 'Pharma Tech' },
];

export const DEPARTMENT_OPTIONS = {
  engineering: [
    { value: 'computer science', label: 'Computer Science' },
    { value: 'computer engineering', label: 'Computer Engineering' },
  ],
  pharmacy: [{ value: 'bpharm', label: 'BPharm' }],
  mbatech: [{ value: 'mbatech', label: 'MBA Tech' }],
  pharmatech: [{ value: 'pharmatech', label: 'Pharma Tech' }],
};

export const getDepartmentOptions = (course) => DEPARTMENT_OPTIONS[course] || [];

export const getCourseLabel = (course) =>
  COURSE_OPTIONS.find((option) => option.value === course)?.label || course || '-';

export const getDepartmentLabel = (course, department) =>
  getDepartmentOptions(course).find((option) => option.value === department)?.label ||
  department ||
  '-';

export const getCategoryLabel = (category) => {
  const normalized = String(category || '').toLowerCase();
  if (normalized === 'hosteller' || normalized === 'hostellers') return 'Hostellers';
  return 'Dayscholars';
};

export const getCategoryTone = (category) => {
  const normalized = String(category || '').toLowerCase();
  return normalized === 'hosteller' || normalized === 'hostellers'
    ? 'bg-purple-100 text-purple-700'
    : 'bg-blue-100 text-blue-700';
};
