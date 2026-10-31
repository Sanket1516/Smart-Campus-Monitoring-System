export const STATUS_STYLES = {
  present: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  absent: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  acked: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  ok: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  drift: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  error: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  pending_query: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  online: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  offline: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

export const Pill = ({ value, label }) => (
  <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[value] || STATUS_STYLES.absent}`}>
    {label || String(value).replace('_', ' ')}
  </span>
);

export const formatDateTime = (value) =>
  value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Never';

export const errorMessage = (error, fallback = 'Request failed') =>
  error?.response?.data?.message || error?.response?.data?.errors?.[0]?.msg || error?.message || fallback;

export const card = 'rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800';
export const th = 'px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300';
export const td = 'whitespace-nowrap px-4 py-2 text-sm text-gray-700 dark:text-gray-200';
export const btn = 'inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50';
export const btnPrimary = `${btn} bg-primary-600 text-white hover:bg-primary-700`;
export const btnSecondary = `${btn} border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700`;
export const btnDanger = `${btn} bg-red-600 text-white hover:bg-red-700`;
export const input = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100';
