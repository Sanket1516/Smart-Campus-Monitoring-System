// Limits for bulk enrollment. Override with environment variables if a deployment needs different numbers.
const int = (name, fallback) => {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const getBulkConfig = () => ({
  maxFileBytes: int('BULK_MAX_FILE_MB', 5) * 1024 * 1024,
  maxRows: int('BULK_MAX_ROWS', 5000),
  batchSize: int('BULK_BATCH_SIZE', 200),
  // Same default the gate scanner uses for a valid SAP ID (VITE_SAP_ID_PATTERN).
  sapIdPattern: process.env.SAP_ID_PATTERN || String.raw`\d{9,11}`,
});

module.exports = { getBulkConfig };
