#!/usr/bin/env node
// Simulated ADMS terminal for testing the /iclock server without hardware.
// It models what the open-source references describe; it is NOT evidence of how an X990
// behaves. Behaviours the pilot must confirm are options here.
//
//   node tools/fake-terminal.js --server http://localhost:5000 --sn FAKE0001 run --seconds 60
//   node tools/fake-terminal.js --server http://localhost:5000 --sn FAKE0001 punch --pin 5
//   node tools/fake-terminal.js --server http://localhost:5000 --sn FAKE0001 enroll --pin 5 --fid 6
const crypto = require('crypto');

const parseFields = (text) => {
  const fields = {};
  String(text)
    .split('\t')
    .forEach((part) => {
      const index = part.indexOf('=');
      if (index > 0) {
        fields[part.slice(0, index)] = part.slice(index + 1);
      }
    });
  return fields;
};

const pad = (value) => String(value).padStart(2, '0');
const formatDeviceTime = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}:${pad(date.getSeconds())}`;

class FakeTerminal {
  constructor({
    baseUrl,
    sn,
    dialect = 'classic',
    pushver = '2.4.1',
    info = 'Ver 6.60 Fake,0,0,0,127.0.0.1,10,0,0,0',
    deleteMissingReturn = -1,
    queryMissingReturn = 0,
    log = () => {},
  }) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.sn = sn;
    this.dialect = dialect;
    this.pushver = pushver;
    this.info = info;
    this.deleteMissingReturn = deleteMissingReturn;
    this.queryMissingReturn = queryMissingReturn;
    this.log = log;
    this.users = new Map();
    this.templates = new Map();
    this.options = {};
    this.received = [];
  }

  async request(method, path, query = {}, body) {
    const url = new URL(`${this.baseUrl}/iclock/${path}`);
    url.searchParams.set('SN', this.sn);
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));

    const response = await fetch(url, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'text/plain' },
      body,
    });
    const text = await response.text();
    this.log(`${method} ${path} -> ${response.status} ${text.split('\n')[0].slice(0, 80)}`);
    return { status: response.status, text };
  }

  async handshake() {
    const result = await this.request('GET', 'cdata', { options: 'all', pushver: this.pushver, language: '69' });

    result.text.split('\n').forEach((line) => {
      const index = line.indexOf('=');
      if (index > 0) {
        this.options[line.slice(0, index)] = line.slice(index + 1);
      }
    });

    return result;
  }

  async uploadQueryResult(table, lines) {
    if (lines.length) {
      await this.request('POST', 'cdata', { table }, lines.join('\n'));
    }
  }

  async executeClassic(command) {
    if (command.startsWith('DATA UPDATE USERINFO ')) {
      const fields = parseFields(command.slice('DATA UPDATE USERINFO '.length));
      this.users.set(fields.PIN, fields);
      return 0;
    }

    if (command.startsWith('DATA UPDATE FINGERTMP ')) {
      const fields = parseFields(command.slice('DATA UPDATE FINGERTMP '.length));
      if (!this.users.has(fields.PIN)) {
        return -1;
      }
      this.templates.set(`${fields.PIN}:${fields.FID}`, fields);
      return 0;
    }

    if (command.startsWith('DATA DELETE USERINFO ')) {
      const pin = parseFields(command.slice('DATA DELETE USERINFO '.length)).PIN;
      if (!this.users.delete(pin)) {
        return this.deleteMissingReturn;
      }
      [...this.templates.keys()].filter((key) => key.startsWith(`${pin}:`)).forEach((key) => this.templates.delete(key));
      return 0;
    }

    if (command.startsWith('DATA QUERY USERINFO')) {
      const pin = parseFields(command.slice('DATA QUERY USERINFO'.length).trim()).PIN;
      const users = pin ? [this.users.get(pin)].filter(Boolean) : [...this.users.values()];
      await this.uploadQueryResult(
        'USERINFO',
        users.map((user) => `PIN=${user.PIN}\tName=${user.Name || ''}\tPri=${user.Pri || 0}`)
      );
      return users.length || !pin ? 0 : this.queryMissingReturn;
    }

    if (command.startsWith('DATA QUERY FINGERTMP ')) {
      const fields = parseFields(command.slice('DATA QUERY FINGERTMP '.length));
      const template = this.templates.get(`${fields.PIN}:${fields.FID}`);
      await this.uploadQueryResult(
        'FINGERTMP',
        template ? [`PIN=${template.PIN}\tFID=${template.FID}\tSize=${template.Size}\tValid=${template.Valid}\tTMP=${template.TMP}`] : []
      );
      return template ? 0 : this.queryMissingReturn;
    }

    // v3 commands on classic firmware.
    if (/^DATA (UPDATE|DELETE) (user|biodata) |^DATA QUERY tablename=/.test(command)) {
      return -1004;
    }

    return -1002;
  }

  async executeV3(command) {
    if (/^DATA (UPDATE|DELETE|QUERY) USERINFO|^DATA (UPDATE|QUERY) FINGERTMP/.test(command)) {
      return -1004;
    }

    if (command.startsWith('DATA UPDATE user ')) {
      const fields = parseFields(command.slice('DATA UPDATE user '.length));
      this.users.set(fields.Pin, { PIN: fields.Pin, Name: fields.Name, Pri: fields.Privilege });
      return 0;
    }

    if (command.startsWith('DATA UPDATE biodata ')) {
      const fields = parseFields(command.slice('DATA UPDATE biodata '.length));
      if (!this.users.has(fields.Pin)) {
        return -1;
      }
      this.templates.set(`${fields.Pin}:${fields.No}`, { PIN: fields.Pin, FID: fields.No, TMP: fields.Tmp });
      return 0;
    }

    if (command.startsWith('DATA DELETE user ')) {
      const pin = parseFields(command.slice('DATA DELETE user '.length)).Pin;
      return this.users.delete(pin) ? 0 : this.deleteMissingReturn;
    }

    if (command.startsWith('DATA QUERY tablename=user')) {
      return 0;
    }

    return -1002;
  }

  // One getrequest; runs every C: line and acks each on devicecmd.
  async poll() {
    const { text } = await this.request('GET', 'getrequest', { INFO: this.info });
    const lines = text.split('\n').filter((line) => line.startsWith('C:'));
    const acks = [];

    for (const line of lines) {
      const match = /^C:(\d+):(.*)$/.exec(line);
      if (!match) {
        continue;
      }

      const [, id, command] = match;
      this.received.push({ id: Number(id), command });
      const code = this.dialect === 'v3' ? await this.executeV3(command) : await this.executeClassic(command);
      acks.push({ id: Number(id), code, command });
      await this.request('POST', 'devicecmd', {}, `ID=${id}&Return=${code}&CMD=DATA`);
    }

    return acks;
  }

  async punch(pin, { time = new Date(), status = 0, verify = 1 } = {}) {
    return this.request('POST', 'cdata', { table: 'ATTLOG', Stamp: String(Date.now()) }, `${pin}\t${formatDeviceTime(time)}\t${status}\t${verify}\t0`);
  }

  // Simulates a template upload after menu enrolment (whether a real X990 does this is UNVERIFIED).
  async uploadTemplate(pin, fingerIndex, bytes = crypto.randomBytes(512), table = 'OPERLOG') {
    const tmp = bytes.toString('base64');
    const line = `FP PIN=${pin}\tFID=${fingerIndex}\tSize=${tmp.length}\tValid=1\tTMP=${tmp}`;
    await this.request('POST', 'cdata', { table, Stamp: String(Date.now()) }, line);
    return { bytes, tmp };
  }

  async run({ seconds = 60, pollMs } = {}) {
    await this.handshake();
    const interval = pollMs || Number(this.options.Delay || 10) * 1000;
    const stopAt = Date.now() + seconds * 1000;

    while (Date.now() < stopAt) {
      await this.poll();
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }
}

const parseArgs = (argv) => {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value.startsWith('--')) {
      args[value.slice(2)] = argv[index + 1];
      index += 1;
    } else {
      args._.push(value);
    }
  }
  return args;
};

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  const terminal = new FakeTerminal({
    baseUrl: args.server || 'http://localhost:5000',
    sn: args.sn || 'FAKE0001',
    dialect: args.dialect || 'classic',
    log: (line) => console.log(`[${new Date().toISOString()}] ${line}`),
  });
  const [action = 'run'] = args._;

  const actions = {
    run: () => terminal.run({ seconds: Number(args.seconds || 60), pollMs: args['poll-ms'] && Number(args['poll-ms']) }),
    punch: () => terminal.punch(args.pin),
    enroll: () => terminal.uploadTemplate(args.pin, Number(args.fid || 0)),
    handshake: () => terminal.handshake(),
    poll: () => terminal.poll(),
  };

  if (!actions[action]) {
    console.error(`Unknown action "${action}". Use run, punch, enroll, handshake or poll.`);
    process.exit(1);
  }

  actions[action]().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { FakeTerminal };
