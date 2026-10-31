const STYLES = {
  enrolled: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  awaiting: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  none: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

const LABELS = {
  enrolled: 'Enrolled',
  awaiting: 'Awaiting fingerprint',
  none: 'No fingerprint',
};

export default function FingerprintStatusBadge({ status }) {
  const key = STYLES[status] ? status : 'none';
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${STYLES[key]}`}>
      {LABELS[key]}
    </span>
  );
}
