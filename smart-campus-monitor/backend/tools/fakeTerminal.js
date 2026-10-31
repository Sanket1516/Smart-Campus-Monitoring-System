#!/usr/bin/env node
/**
 * Fake ADMS push terminal. Simulates handshake, polling, acknowledgements, ATTLOG
 * punches and template uploads so the server can be tested without hardware.
 *
 * Its behaviour is modelled on the open protocol description, NOT on a real X990.
 * In particular: deleting a missing user answers -1, v3 commands on a classic unit
 * answer -1004 (and vice versa), and ENROLL_FP answers -1.
 *
 * CLI:
 *   node tools/fakeTerminal.js --url http://127.0.0.1:5000 --sn FAKE001 [--dialect classic|v3]
 *        [--polls 20] [--interval 2000] [--punch 1001] [--enrol 1001:0] [--size-mode bytes|base64]
 */
const crypto = require('crypto');

class FakeTerminal {
  constructor({ baseUrl, sn, dialect = 'classic', pushver = '2.4.1', sizeMode = 'bytes', fetchImpl = globalThis.fetch, log = () => {} }) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.sn = sn;
    this.dialect = dialect;
    this.pushver = pushver;
    this.sizeMode = sizeMode;
    this.fetch = fetchImpl;
    this.log = log;
    this.users = new Map(); // pin -> {name}
    this.templates = new Map(); // `${pin}:${fid}` -> {template, valid}
    this.executed = [];
    this.options = null;
  }

  async request(method, path, body) {
    const response = await this.fetch(`${this.baseUrl}/iclock/${path}`, {
      method,
      headers: { 'Content-Type': 'text/plain' },
      body,
    });
    const text = await response.text();
    return { status: response.status, text };
  }

  async handshake() {
    const res = await this.request('GET', `cdata?SN=${this.sn}&options=all&pushver=${this.pushver}&language=69`);
    if (res.status === 200) {
      this.options = Object.fromEntries(
        res.text
          .split('\n')
          .slice(1)
          .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)])
      );
    }
    this.log(`handshake -> ${res.status}`);
    return res;
  }

  /** One poll: fetch commands, execute, acknowledge. Returns executed results. */
  async poll() {
    const res = await this.request('GET', `getrequest?SN=${this.sn}&INFO=Ver 6.60 FAKE,${this.users.size},${this.templates.size},0,127.0.0.1,10,0,0,0`);
    if (res.status !== 200) return { status: res.status, results: [] };
    if (res.text.trim() === 'OK') return { status: 200, results: [] };
    const results = [];
    const lines = res.text.split('\n').filter((line) => line.startsWith('C:'));
    for (const line of lines) {
      const second = line.indexOf(':', 2);
      const id = Number(line.slice(2, second));
      const command = line.slice(second + 1);
      const returnCode = await this.execute(command);
      results.push({ id, command, returnCode });
      this.executed.push({ id, command, returnCode });
    }
    if (results.length) {
      const body = results.map((r) => `ID=${r.id}&Return=${r.returnCode}&CMD=${r.command.split(' ')[0]}`).join('\n');
      await this.request('POST', `devicecmd?SN=${this.sn}`, body);
    }
    this.log(`poll -> ${results.map((r) => `${r.id}:${r.returnCode}`).join(',') || 'OK'}`);
    return { status: 200, results };
  }

  static kv(text) {
    const out = {};
    text.split('\t').forEach((part) => {
      const i = part.indexOf('=');
      if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
    });
    return out;
  }

  async execute(command) {
    const classic = this.dialect === 'classic';
    const match = /^DATA (UPDATE|DELETE|QUERY) (\S+)(?: (.*))?$/.exec(command);
    if (!match) return -1;
    const [, verb, table, rest = ''] = match;
    const kv = FakeTerminal.kv(rest);
    const classicTables = ['USERINFO', 'FINGERTMP'];
    const v3Tables = ['user', 'biodata'];
    if (classic && !classicTables.includes(table)) return -1004;
    if (!classic && !v3Tables.includes(table)) return -1004;
    const pin = kv.PIN || kv.Pin;

    if (verb === 'UPDATE' && (table === 'USERINFO' || table === 'user')) {
      if (!pin) return -1002;
      this.users.set(pin, { name: kv.Name || '' });
      return 0;
    }
    if (verb === 'UPDATE' && (table === 'FINGERTMP' || table === 'biodata')) {
      const tmp = kv.TMP || kv.Tmp;
      const fid = kv.FID ?? kv.No;
      if (!pin || !tmp || fid === undefined) return -1002;
      if (!this.users.has(pin)) return -1; // template before user record
      if (classic && kv.Size !== undefined) {
        const expected = this.sizeMode === 'base64' ? tmp.length : Buffer.from(tmp, 'base64').length;
        if (Number(kv.Size) !== expected) return -2;
      }
      this.templates.set(`${pin}:${fid}`, { template: tmp, valid: Number(kv.Valid ?? 1) });
      return 0;
    }
    if (verb === 'DELETE' && (table === 'USERINFO' || table === 'user')) {
      if (!this.users.has(pin)) return -1;
      this.users.delete(pin);
      Array.from(this.templates.keys())
        .filter((key) => key.startsWith(`${pin}:`))
        .forEach((key) => this.templates.delete(key));
      return 0;
    }
    if (verb === 'QUERY' && (table === 'USERINFO' || table === 'user')) {
      const pins = pin ? (this.users.has(pin) ? [pin] : []) : Array.from(this.users.keys());
      if (pins.length) {
        const body = pins.map((p) => `USER PIN=${p}\tName=${this.users.get(p).name}\tPri=0\tPasswd=\tCard=\tGrp=1`).join('\n');
        await this.request('POST', `cdata?SN=${this.sn}&table=OPERLOG&Stamp=${Date.now()}`, body);
      }
      return 0;
    }
    if (verb === 'QUERY' && (table === 'FINGERTMP' || table === 'biodata')) {
      await this.uploadTemplatesFor(pin);
      return 0;
    }
    return -1;
  }

  async uploadTemplatesFor(pin) {
    const lines = [];
    this.templates.forEach((value, key) => {
      const [p, fid] = key.split(':');
      if (pin && p !== pin) return;
      lines.push(this.templateLine(p, fid, value.template, value.valid));
    });
    if (lines.length) await this.request('POST', `cdata?SN=${this.sn}&table=OPERLOG&Stamp=${Date.now()}`, lines.join('\n'));
  }

  templateLine(pin, fid, template, valid = 1) {
    const size = this.sizeMode === 'base64' ? template.length : Buffer.from(template, 'base64').length;
    return this.dialect === 'classic'
      ? `FP PIN=${pin}\tFID=${fid}\tSize=${size}\tValid=${valid}\tTMP=${template}`
      : `BIODATA Pin=${pin}\tNo=${fid}\tIndex=0\tValid=1\tDuress=${valid === 3 ? 1 : 0}\tType=1\tMajorVer=10\tMinorVer=0\tFormat=0\tTmp=${template}`;
  }

  /** Simulate enrolment on the device menu: create user + template, then upload (OPERLOG). */
  async enrolOnMenu(pin, fid = 0, template = FakeTerminal.randomTemplate()) {
    if (!this.users.has(String(pin))) this.users.set(String(pin), { name: '' });
    this.templates.set(`${pin}:${fid}`, { template, valid: 1 });
    const res = await this.request(
      'POST',
      `cdata?SN=${this.sn}&table=OPERLOG&Stamp=${Date.now()}`,
      this.templateLine(String(pin), fid, template, 1)
    );
    return { ...res, template };
  }

  async punch(pin, date = new Date(), { status = 0, verify = 1, offsetMinutes = 330 } = {}) {
    const local = new Date(date.getTime() + offsetMinutes * 60 * 1000);
    const time = local.toISOString().replace('T', ' ').slice(0, 19);
    const res = await this.request('POST', `cdata?SN=${this.sn}&table=ATTLOG&Stamp=${Date.now()}`, `${pin}\t${time}\t${status}\t${verify}\t0\t0\t0`);
    return { ...res, time };
  }

  async drain(maxPolls = 50) {
    const all = [];
    for (let i = 0; i < maxPolls; i += 1) {
      const { results } = await this.poll();
      if (!results.length) break;
      all.push(...results);
    }
    return all;
  }

  static randomTemplate(bytes = 512) {
    return crypto.randomBytes(bytes).toString('base64');
  }
}

module.exports = { FakeTerminal };

if (require.main === module) {
  const args = process.argv.slice(2);
  const arg = (name, fallback) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : fallback;
  };
  const terminal = new FakeTerminal({
    baseUrl: arg('url', 'http://127.0.0.1:5000'),
    sn: arg('sn', 'FAKE001'),
    dialect: arg('dialect', 'classic'),
    sizeMode: arg('size-mode', 'bytes'),
    log: (msg) => console.log(`[${new Date().toISOString()}] ${msg}`),
  });
  const polls = Number(arg('polls', 20));
  const interval = Number(arg('interval', 2000));
  (async () => {
    await terminal.handshake();
    const enrol = arg('enrol');
    if (enrol) {
      const [pin, fid = '0'] = enrol.split(':');
      const res = await terminal.enrolOnMenu(pin, Number(fid));
      console.log(`enrol ${pin}:${fid} -> ${res.status}`);
    }
    const punch = arg('punch');
    if (punch) console.log(`punch ${punch} -> ${(await terminal.punch(punch)).status}`);
    for (let i = 0; i < polls; i += 1) {
      await terminal.poll();
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    console.log(`users on fake terminal: ${Array.from(terminal.users.keys()).join(',') || '(none)'}`);
  })().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
