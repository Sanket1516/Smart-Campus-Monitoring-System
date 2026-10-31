# pyzk sidecar (internal)

Small FastAPI service that is the **only** component allowed to open ZK TCP port 4370 on
terminals. The Node backend calls it for bulk first loads, template reads/writes, nightly
audits and backups. Daily changes go through ADMS push instead.

**Licence note:** this service uses [pyzk](https://github.com/fananimi/pyzk), which is
GPL-2.0. The sidecar is used internally by the college and is **not distributed**. If you
ever distribute it, the GPL-2.0 terms apply to it.

## Run

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill SIDECAR_SECRET, SIDECAR_TERMINAL_CIDRS, ZK_COMM_KEY
set -a; . ./.env; set +a
python -m app.main
```

Bind to `127.0.0.1` (same host as the backend) or the server's VLAN address only.
Firewall: only this host may reach terminals on TCP 4370.

## Endpoints (header `X-Sidecar-Secret` required)

| Method | Path | Action |
|---|---|---|
| GET | `/terminals/{ip}/info` | serial, firmware, platform, algorithm |
| GET | `/terminals/{ip}/users` | `get_users()` (no card numbers or passwords returned) |
| GET | `/terminals/{ip}/templates[?user_id=]` | templates (base64) + SHA-256 |
| POST | `/terminals/{ip}/users` | `set_user` → `save_user_template` → `refresh_data` |
| POST | `/terminals/{ip}/users/batch` | same for up to 200 users, one `refresh_data` |
| DELETE | `/terminals/{ip}/users/{user_id}` | `delete_user` (never `clear_data`); missing user = `deleted:false` |
| POST | `/terminals/{ip}/enroll` | `enroll_user` (off unless `SIDECAR_ENROLL_ENABLED=true`; UNVERIFIED) |
| POST | `/terminals/{ip}/backup` | dump users + templates to `SIDECAR_BACKUP_DIR` (AES-256-GCM if `SIDECAR_BACKUP_KEY`) |

Every session: connect → `disable_device` → work → `enable_device` (finally) →
`disconnect` (finally). One session per terminal at a time; `SIDECAR_MAX_SESSIONS` caps the
total. `clear_data`, `clear_attendance`, `poweroff` and `restart` are blocked.

## Scripts

```bash
python -m scripts.backup --ip 10.20.0.11
python -m scripts.bulk_load --target 10.20.0.12 --source-backup backups/backup-SN-....json.enc \
    --state state-10.20.0.12.json --batch 20 --delay 0.5 --verify
python -m scripts.pilot --help          # pilot harness, see ../PILOT_CHECKLIST.md
python -m scripts.dev_fake_server       # fake terminals for local development only
```

## Tests

```bash
pip install -r requirements-dev.txt
pytest
```
