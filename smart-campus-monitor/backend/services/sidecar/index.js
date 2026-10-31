const { getSyncConfig } = require('../../config/terminalSync');
const { createHttpSidecar } = require('./httpClient');
const { createFakeSidecar } = require('./fakeSidecar');

let instance;

/** Returns the configured sidecar adapter, or null when no sidecar is configured. */
const getSidecar = () => {
  if (instance !== undefined) return instance;
  const { sidecar } = getSyncConfig();
  if (process.env.SIDECAR_FAKE === 'true') {
    if (process.env.SIMULATION_MODE !== 'true' && process.env.NODE_ENV !== 'test') {
      throw new Error('SIDECAR_FAKE requires SIMULATION_MODE=true');
    }
    instance = createFakeSidecar();
  } else if (sidecar.url) {
    instance = createHttpSidecar({ url: sidecar.url, secret: sidecar.secret, timeoutMs: sidecar.timeoutMs });
  } else {
    instance = null;
  }
  return instance;
};

const setSidecarForTests = (adapter) => {
  instance = adapter;
};

module.exports = { getSidecar, setSidecarForTests };
