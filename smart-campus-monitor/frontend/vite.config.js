import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));
const certificatePath = path.join(frontendRoot, 'certs', 'lan.pem');
const privateKeyPath = path.join(frontendRoot, 'certs', 'lan-key.pem');

const getLanCertificate = () => {
  if (!existsSync(certificatePath) || !existsSync(privateKeyPath)) {
    throw new Error(
      'Local HTTPS certificate is missing. From frontend/, run `npm run setup:lan-https`, then restart Vite.'
    );
  }

  return {
    cert: readFileSync(certificatePath),
    key: readFileSync(privateKeyPath),
  };
};

const getLanIpv4 = () => {
  const addresses = Object.entries(os.networkInterfaces()).flatMap(([name, entries]) =>
    (entries || []).map((entry) => ({ name, ...entry }))
  );
  const usable = addresses.filter((entry) =>
    (entry.family === 'IPv4' || entry.family === 4) &&
    !entry.internal &&
    !entry.address.startsWith('169.254.') &&
    !/virtual|vEthernet|hyper-v|vmware|virtualbox|bluetooth|loopback|teredo/i.test(entry.name)
  );
  return usable.find((entry) => /wi-?fi|ethernet/i.test(entry.name))?.address || usable[0]?.address || 'localhost';
};

const phoneScanUrlPlugin = {
  name: 'phone-scan-url',
  transformIndexHtml(html, context) {
    if (!context.server) return html;
    const phoneScanUrl = `https://${getLanIpv4()}:5173/scanner`;
    return html.replace('</head>', `<meta name="phone-scan-url" content="${phoneScanUrl}">\n</head>`);
  },
};

export default defineConfig(({ command, mode }) => {
  const useLocalHttps = command === 'serve' && mode === 'development';

  return {
    plugins: [react(), phoneScanUrlPlugin],
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      ...(useLocalHttps ? { https: getLanCertificate() } : {}),
      proxy: {
        '/api': {
          target: 'http://localhost:5000',
          changeOrigin: true,
        },
        // Live scan events: without this the socket handshake hits Vite and returns index.html.
        '/socket.io': {
          target: 'http://localhost:5000',
          changeOrigin: true,
          ws: true,
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/tests/setup.js',
    },
  };
});
