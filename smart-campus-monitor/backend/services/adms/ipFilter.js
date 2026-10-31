/** Minimal CIDR matching for IPv4 and IPv6 (no dependencies). */
const net = require('net');

const ipv4ToBigInt = (ip) => ip.split('.').reduce((acc, part) => (acc << 8n) + BigInt(Number(part)), 0n);

const expandIpv6 = (ip) => {
  let address = ip;
  if (address.includes('.')) {
    // IPv4-embedded tail
    const lastColon = address.lastIndexOf(':');
    const v4 = address.slice(lastColon + 1);
    const n = ipv4ToBigInt(v4);
    address = `${address.slice(0, lastColon)}:${((n >> 16n) & 0xffffn).toString(16)}:${(n & 0xffffn).toString(16)}`;
  }
  const [head, tail] = address.split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = tail !== undefined && tail !== '' ? tail.split(':') : [];
  const missing = 8 - headParts.length - tailParts.length;
  const parts = tail !== undefined ? [...headParts, ...Array(missing).fill('0'), ...tailParts] : headParts;
  return parts.map((p) => p || '0');
};

const ipv6ToBigInt = (ip) => expandIpv6(ip).reduce((acc, part) => (acc << 16n) + BigInt(parseInt(part, 16)), 0n);

/** Normalise "::ffff:10.0.0.5" to "10.0.0.5". */
const normalizeIp = (ip) => {
  const value = String(ip || '').trim();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(value);
  return mapped ? mapped[1] : value;
};

const parseCidr = (cidr) => {
  const [address, bitsRaw] = String(cidr).trim().split('/');
  const ip = normalizeIp(address);
  const family = net.isIP(ip);
  if (!family) throw new Error(`Invalid CIDR "${cidr}"`);
  const maxBits = family === 4 ? 32 : 128;
  const bits = bitsRaw === undefined ? maxBits : Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > maxBits) throw new Error(`Invalid CIDR "${cidr}"`);
  const value = family === 4 ? ipv4ToBigInt(ip) : ipv6ToBigInt(ip);
  const mask = bits === 0 ? 0n : ((1n << BigInt(bits)) - 1n) << BigInt(maxBits - bits);
  return { family, mask, network: value & mask };
};

const createIpMatcher = (cidrs) => {
  const ranges = (cidrs || []).map(parseCidr);
  return (rawIp) => {
    const ip = normalizeIp(rawIp);
    const family = net.isIP(ip);
    if (!family) return false;
    const value = family === 4 ? ipv4ToBigInt(ip) : ipv6ToBigInt(ip);
    return ranges.some((range) => range.family === family && (value & range.mask) === range.network);
  };
};

module.exports = { createIpMatcher, normalizeIp, parseCidr };
