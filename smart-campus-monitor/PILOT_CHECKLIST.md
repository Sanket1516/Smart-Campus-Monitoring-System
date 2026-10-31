# Two-terminal pilot checklist

Goal: answer every item in `HARDWARE_VERIFICATION.md` with logged evidence. Terminals
**A** (enrollment role) and **B** (gate role), one test user per step. Do not use
production terminals.

## Logs

- Server (push): set `ADMS_PILOT_LOG=pilot-adms.jsonl` before starting the backend.
- Sidecar (pyzk): `python -m scripts.pilot --log pilot-sidecar.jsonl …`
- Every line has: `server_utc`, device time (`device_time`), terminal SN/IP/firmware/algorithm,
  route or action, command text (templates redacted), `result_code`, `user_id`,
  `finger_index`, template size, `sha256`, `verify_outcome` (operator answer), latency.
- Summary: `node backend/tools/pilot/summarize.js pilot-adms.jsonl sidecar/pilot-sidecar.jsonl`

Log files contain personal data (PINs, names in some queries). Keep them on the admin
machine and delete after the pilot report.

## Preparation

1. Put A, B, the server and the sidecar host on an isolated VLAN. Block TCP 4370 from everything except the sidecar host.
2. Set the same comm key on A and B; set `ZK_COMM_KEY` in the sidecar env.
3. Register A (machine 50, enrollment) and B (e.g. 101, MAIN_GATE) on the Terminals page with SN and IP.
4. In the device menu set the cloud/ADMS server to the server's VLAN IP and `ADMS_PORT`.
5. Start Wireshark on the server: capture filter `host <A-ip> or host <B-ip>`.

## Steps

| # | Step | Command / action | Evidence to check |
|---|------|------------------|-------------------|
| 1 | Terminal info | `python -m scripts.pilot info --ip A` (and B) | SN, firmware, algorithm, device time; compare with `INFO=` in `command_sent`/handshake logs |
| 2 | Baseline backup | `python -m scripts.pilot backup --ip A` (and B) | backup file per terminal (encrypted if `SIDECAR_BACKUP_KEY`) |
| 3 | Read templates + copy via pyzk and verify | enrol a test user on A's menu; `pilot read-templates --ip A --user N`; `pilot copy-verify --src A --dst B --user N --ask` | `sha_match`, `template_size`, operator `verify_outcome` on B |
| 4 | Dialect detection | power-cycle B so it handshakes; or `node tools/pilot/pushSteps.js probe --sn B` | `handshake` and `command_ack` lines: dialect, push version, probe return code |
| 5 | Push copy | delete N from B (`pilot delete-confirm --ip B --user N`), then `pushSteps.js push-copy --sap <sap> --sn B`; verify finger on B | `command_sent` (TEMPLATE_WRITE size/sha), `command_ack` code; `pilot read-templates --ip B --user N` sha equals A's |
| 6 | Delete and confirm | `pushSteps.js delete --sap <sap> --sn B`, repeat once | first ack 0; second ack code → `ADMS_DELETE_MISSING_CODES`; `pilot read-templates --ip B` shows nothing |
| 7 | Restore without recapture | Unblock in the UI (or `pushSteps.js push-copy`); or `pilot restore --backup <file> --ip B --user N --ask` | sha matches stored value; finger verifies |
| 8 | Event delivery (50 punches) | note start time; 50 verifications on B; `pushSteps.js punches --sn B --since <start> --expected 50` | received/missing count, `delivery_latency_ms` (includes device clock drift), duplicates rejected |
| 9 | Offline recovery | unplug B's network; block the test student in the UI; make 5 punches on B; reconnect | after reconnect: queued USER_DELETE is acked; offline punches arrive and are recorded (older than `ADMS_REALTIME_WINDOW_SEC` → `recorded_only`) |
| 10 | Traffic comparison | compare Wireshark capture with `pilot-adms.jsonl` | handshake query params, option names, whether multiple `C:` lines work (`ADMS_MAX_COMMANDS_PER_POLL=3` test), HTTPS attempt |
| 11 | Robustness | `pilot robustness --ip A --cycles 100 --clients 2` | `robustness_summary.failures`; any device lock-ups; then confirm A still pushes |

## After the pilot

1. Fill the "Pilot result" column for each row of `HARDWARE_VERIFICATION.md` with the log evidence.
2. Set the config values (dialect, Size mode, commands per poll, delete codes, TLS).
3. Re-run the backend tests (`npm test`) and the sidecar tests (`pytest`).
4. Restore A and B from the baseline backups if needed (`scripts.bulk_load --source-backup`).
