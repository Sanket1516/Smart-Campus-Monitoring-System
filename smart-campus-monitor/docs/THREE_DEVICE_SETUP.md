# Three-device setup and operations guide

| Device | Role | Where | Does |
|---|---|---|---|
| Device 1 | `ADMIN_ENROLLMENT` | admin office | the only place fingerprints are captured |
| Device 2 | `GATE_ENTRY` | campus entrance | receives users + templates, records **ENTRY** |
| Device 3 | `GATE_EXIT` | campus exit | receives users + templates, records **EXIT** |

The backend (MongoDB) is the source of truth for identity, enrolment, sync state and
attendance. Device 1 is the capture point, not the database.

Statements about the X990 below are marked **(verify)** when they come from general ZKTeco
documentation or open-source references and have not been tested on your units.

---

## 1. Components and startup

| Component | Start | Listens on |
|---|---|---|
| MongoDB 7 | your service manager | 27017 (local only) |
| Backend (Node 20) | `cd backend && npm ci && npm start` | `PORT` (API, default 5000) and `ADMS_PORT` (terminals, e.g. 8081) |
| Frontend | `cd frontend && npm ci && npm run build` → serve `dist/` (nginx config in repo) or `npm run dev` | 5173 in dev |
| Sidecar (optional but recommended) | see `sidecar/README.md`: `python -m app.main` | `SIDECAR_HOST:SIDECAR_PORT` (127.0.0.1:8770) |

Order: MongoDB → backend → sidecar → frontend. The backend refuses to start without
`MONGO_URI`, `JWT_SECRET` (32+ chars) and `TEMPLATE_ENC_KEY` (32 bytes).

Existing installation: run once after deploying this version:

```bash
cd backend
node scripts/migrateLegacyTemplates.js --dry-run && node scripts/migrateLegacyTemplates.js
node scripts/migrateThreeDeviceRoles.js --dry-run && node scripts/migrateThreeDeviceRoles.js
```

## 2. Environment (backend `.env`)

Minimum for the three-device setup (full list in `backend/.env.example`):

```ini
MONGO_URI=mongodb://127.0.0.1:27017/smart_campus
JWT_SECRET=<64 random chars>
TEMPLATE_ENC_KEY=<64 hex chars>              # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ADMS_PORT=8081                               # terminals connect here
ADMS_HOST=10.20.0.5                          # server address on the terminal VLAN
ADMS_ALLOWED_CIDRS=10.20.0.0/24              # terminal VLAN
UNIQUE_DEVICE_ROLES=ADMIN_ENROLLMENT,GATE_ENTRY,GATE_EXIT
ATTENDANCE_DEDUPE_SECONDS=60
ENROLL_METHOD=menu
ENROLL_TIMEOUT_MIN=10
SIDECAR_URL=http://127.0.0.1:8770
SIDECAR_SECRET=<same value as in the sidecar>
RECONCILE_SOURCE=sidecar
SYNC_ACK_COUNTS_AS_VERIFIED=false            # keep false: FULLY_SYNCHRONIZED needs read-back
SIMULATION_MODE=false                        # never true in production
```

No terminal IP is hard-coded anywhere: IPs, serials and roles live in the `TerminalConfig`
collection and are edited in the UI.

## 3. Network

```
            campus LAN / admin PCs ── HTTPS ──► nginx ──► backend :5000 (/api, web UI)
                                                    
 terminal VLAN 10.20.0.0/24
   Device 1 10.20.0.11 ─┐
   Device 2 10.20.0.12 ─┼── HTTP ──► backend 10.20.0.5:8081 (/iclock, ADMS push)
   Device 3 10.20.0.13 ─┘
        ▲ TCP 4370 (ZK protocol) only from the sidecar host (10.20.0.5)
```

| Flow | Direction | Port | Notes |
|---|---|---|---|
| ADMS push | terminal → server | `ADMS_PORT` (TCP, e.g. 8081) | plain HTTP unless the X990 supports HTTPS **(verify)**; allow only the terminal VLAN |
| ZK protocol | sidecar → terminal | 4370 TCP (UDP with `ZK_FORCE_UDP`) **(verify)** | block from every other host |
| Web/API | admin PCs → server | 443 via nginx | normal campus access |

Firewall rules:
1. Terminal VLAN → server `ADMS_PORT`: allow. Everything else from the VLAN: deny.
2. Server (sidecar) → terminal VLAN TCP 4370: allow. Any other host → 4370: deny.
3. Internet → terminal VLAN / `ADMS_PORT`: deny. Never port-forward 8081 or 4370.

Terminal network settings (on each X990, **(verify)** menu names vary by firmware):
- Static IP, mask, gateway on the terminal VLAN (e.g. 10.20.0.11/12/13).
- Communication key (comm key / password) set on every unit; put the same value in the
  sidecar's `ZK_COMM_KEY` (or per IP in `ZK_COMM_KEYS`). The backend only stores the
  `commKeySet` flag.
- ADMS / cloud server: server address `10.20.0.5`, port `8081`, HTTPS off unless tested.
  On ZKTeco push firmware this is usually under *COMM → Cloud Server Setting* **(verify)**.
- Device time zone / clock: set to IST. Push timestamps carry no time zone; the backend
  also stores its own receive time (`ADMS_DEVICE_UTC_OFFSET_MIN=330`).

## 4. Device registration procedure

1. Read the serial number from the device (*System Info* **(verify)**) or with
   `python -m scripts.pilot info --ip <ip>` from the sidecar.
2. In the web UI, **Terminals → Register**:
   - Device 1: machine number **50**, role is fixed to *Admin Enrollment*.
   - Device 2: machine number e.g. **101**, role *Gate Entry*.
   - Device 3: machine number e.g. **102**, role *Gate Exit*.
   - Enter the serial number exactly, the IP, location, communication = *ADMS push*
     (or *ZK TCP pull* if the unit cannot reach the server).
3. The server rejects a second enabled terminal with the same role (`UNIQUE_DEVICE_ROLES`).
4. Point each terminal at the ADMS server. Within one poll interval the **Terminal Sync**
   page shows it online with push version and dialect (probe). An unregistered serial is
   refused and raises an *unknown terminal* alert.
5. Optional: *Backup* on each terminal before first use (sidecar, encrypted if
   `SIDECAR_BACKUP_KEY` is set).

### Push or pull?

- **adms_push** (default): the terminal connects to the server, gets commands on its next
  poll and uploads punches in real time. Works through NAT; needs the ADMS option on the
  device.
- **zk_tcp_pull**: for a unit that cannot push. The sidecar connects every
  `PULL_POLL_SECONDS`, executes the same command queue over ZK TCP and pulls attendance.
  Needs the terminal IP and the sidecar. Punches arrive with up to one poll interval of delay.

## 5. Daily workflow

1. **Register student** (form or Excel) → a ZKTeco user ID (`zktUserID`, same on all
   devices) is assigned; the user record is queued for both gates; status *Awaiting
   fingerprint*.
2. **Record consent** (Student Management → Sync drawer, or the Enrollment screen).
3. **Enrollment screen → Start enrolment on Device 1** → the user is created on Device 1.
   On Device 1: *User Mgt → find the user ID → enrol fingerprint* **(verify)**.
4. The template reaches the backend (push upload, or *Fetch template* via the sidecar),
   is encrypted, status *Enrolled*; jobs for both gates are queued automatically.
5. Each gate acknowledges the write (*Stored*) and is read back (*Verified*). The student
   becomes **FULLY_SYNCHRONIZED** only when both gates are verified. If a read-back is not
   possible the status stays **SYNCHRONIZED_UNVERIFIED**; if one gate fails it is
   **PARTIALLY_SYNCHRONIZED**.
6. Scans: Device 2 always records ENTRY, Device 3 always EXIT. Repeats within
   `ATTENDANCE_DEDUPE_SECONDS` are ignored as duplicates.
7. **Block** → deleted from both gates (Device 1 keeps the template); scans denied at once.
   **Unblock** → restored from the stored template, no recapture.
8. **De-enrol & erase** → deleted from all three devices and from MongoDB.

Enrolment failures: *Capture failed* (device or sidecar reported failure), *Timed out*
(no template within `ENROLL_TIMEOUT_MIN`), *Duplicate* (identical template already stored
for another student). Use **Retry enrolment**.

## 6. Troubleshooting

| Symptom | Check |
|---|---|
| Terminal never online | VLAN routing, `ADMS_PORT` reachable from the terminal, server address/port on the device, serial registered exactly, terminal IP inside `ADMS_ALLOWED_CIDRS` (server log: `refused … non-terminal IP`) |
| "Unknown device" alerts | serial on the device differs from the registered one |
| Dialect stays *unknown* | the probe got neither 0 nor -1/-1004; read `command_ack` in the pilot log; set dialect manually on Terminal Sync |
| Commands stay *pending* | terminal offline or not polling; `ADMS_STRICT_ORDER` waits for the previous ack (10 min timeout) |
| Template write fails with -2 | `ADMS_TEMPLATE_SIZE_MODE` wrong (bytes vs base64) — see `HARDWARE_VERIFICATION.md` #4 |
| Gate stuck at *Stored, not verified* | neither sidecar read-back nor push template query works; configure the sidecar (needs IP + 4370) or, after the pilot, decide on `SYNC_ACK_COUNTS_AS_VERIFIED` |
| Enrolment *Timed out* | template was not uploaded by Device 1; use *Fetch template* (sidecar) or check that the finger was enrolled under the right user ID |
| Sidecar 502 | terminal unreachable on 4370, wrong comm key, or session limit; `ZK_FORCE_UDP`, `ZK_TIMEOUT` |
| Old punches flood in after first connect | device uploaded its history (stamp 0); stored and de-duplicated, not run through live notifications |

Logs: backend lines start with `[adms]`, `[sync]`, `[verify]`; the sidecar logs ip, action
and latency only. Set `ADMS_PILOT_LOG` to capture JSONL evidence.

## 7. Backup and restore

| What | How |
|---|---|
| MongoDB (students, encrypted templates, queue, audit) | `mongodump --uri "$MONGO_URI" --gzip --archive=backup-$(date +%F).gz` daily; restore with `mongorestore --gzip --archive=…` |
| `TEMPLATE_ENC_KEY` | store separately (password manager / sealed envelope). Without it the stored templates cannot be decrypted; with it and a DB dump they can — keep them apart |
| Terminal contents | Terminal Sync → *Backup* (or `python -m scripts.backup --ip …`); encrypted with `SIDECAR_BACKUP_KEY` |
| Restore a replaced gate | register the new serial with the same role (disable the old one first) → *Resync*; small sets via push, large via the sidecar bulk loader |
| Restore a terminal from its own backup | `python -m scripts.bulk_load --target <ip> --source-backup <file> --verify` |

## 8. Security summary

- ADMS push has no real authentication: VLAN isolation, `ADMS_ALLOWED_CIDRS`, registered
  serials, rate limiting, optional HTTPS listener. Keep `/iclock` off the internet.
- Templates: AES-256-GCM, key only in the environment, ciphertext bound to student + finger
  (AAD), SHA-256 for integrity; never returned by any API, never logged (command text stores
  a redacted placeholder; the template is rendered only when sent to the terminal).
- Every template read/write/delete, block, unblock, resync, enrolment, erasure and consent
  change is in the biometric audit log.
- Consent is required before enrolment (parent/guardian for under-18s, DPDP Act 2023
  s.9(1)); erasure on de-enrolment or consent withdrawal (s.8(7)). Not legal advice.
- Simulation: simulated terminals are refused unless `SIMULATION_MODE=true`, which itself is
  refused in production; simulated templates are never sent to real terminals.
- Sidecar: shared secret header, terminal CIDR allow-list, `clear_data` and other
  destructive calls blocked.
