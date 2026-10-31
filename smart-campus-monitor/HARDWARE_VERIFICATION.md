# Hardware verification (eSSL X990 / ZKTeco-compatible)

Everything below is **unverified on real X990 hardware**. The code puts each item behind a
config flag or an adapter so it can be changed after the 2-terminal pilot without code
changes. Results come only from the pilot logs (`PILOT_CHECKLIST.md`); nothing here is a
measured result.

| # | Unknown | Where it lives | Default | How the pilot decides it |
|---|---------|----------------|---------|--------------------------|
| 1 | Push dialect (classic `DATA … USERINFO/FINGERTMP` vs v3 `user`/`biodata`) | `services/adms/dialects/*`, probe in `admsService.handleProbeResult`; per terminal `TerminalConfig.dialect`; `ADMS_FORCE_DIALECT` | probe at handshake: classic first, then v3 on -1 / -1004 | Step 4: log `dialect` and `push_version` per SN from `handshake` + `command_ack` |
| 2 | `pushver` / push version string | stored as `TerminalConfig.pushVersion` from the handshake query | — | Step 4 log |
| 3 | v3 field names / table names / `MajorVer` `MinorVer` | `ADMS_V3_USER_TABLE`, `ADMS_V3_BIODATA_TABLE`, `ADMS_V3_MAJOR_VER`, `ADMS_V3_MINOR_VER`, `dialects/v3.js` | `user`, `biodata`, version fields omitted | Only if the probe says v3: compare with Wireshark capture (step 10) |
| 4 | Does `Size=` count raw bytes or base64 characters? | `ADMS_TEMPLATE_SIZE_MODE` (`bytes`/`base64`); every upload logs `size_match` | `bytes` | Step 3/5: `template_upload.size_match` and whether `DATA UPDATE FINGERTMP` returns 0 |
| 5 | Does the terminal upload a template by itself after menu enrolment, and in which table (`OPERLOG` `FP …`, `FINGERTMP`, `BIODATA`)? | `admsService.handleOperations` accepts all; `ENROLL_METHOD=menu` falls back to sidecar fetch / `TEMPLATE_QUERY` | menu + manual "Fetch template" | Step 5: is there a `template_upload` log line after menu enrolment? |
| 6 | Remote enrolment works over push (`ENROLL_FP`) or pyzk (`enroll_user`)? | `ENROLL_PUSH_REMOTE_ENABLED`, `ENROLL_PYZK_REMOTE_ENABLED`, `SIDECAR_ENROLL_ENABLED` | both off | Optional pilot step; enable only if it works |
| 7 | Do empty `Passwd=` / `Card=` erase existing values? | `ADMS_EMPTY_FIELD_MODE` (`omit`/`send`) | `omit` (fields left out) | Create a user with a card on the device, then send an update; check the card is kept |
| 8 | Can one `getrequest` reply carry several `C:` lines? | `ADMS_MAX_COMMANDS_PER_POLL`, `ADMS_STRICT_ORDER` | 1, strict | Set to 3 on one pilot terminal; check every command gets its own ack (`command_ack`) |
| 9 | HTTPS for push | `ADMS_TLS_KEY`/`ADMS_TLS_CERT`, `TerminalConfig.tlsSupported` | HTTP on a separate VLAN-only listener | Try the device's HTTPS option; record the result on the terminal |
| 10 | Simultaneous TCP sessions on port 4370 | `SIDECAR_MAX_SESSIONS`, per-terminal lock in `zk_client.TerminalPool` | 2 total, 1 per terminal | Step 11: `pilot robustness --clients 2` |
| 11 | Does a template copied from one X990 to another verify reliably? | — (behaviour of the device) | — | Steps 3 and 5: `sha_match` **and** operator-recorded `verify_outcome` |
| 12 | Return code for `DATA DELETE USERINFO` on a missing user | `ADMS_DELETE_MISSING_CODES` | `-1` treated as "already deleted" | Step 6: delete twice, record the second code |
| 13 | Handshake option names/values (`TransFlag`, `TimeZone` units, `Delay`, `ServerVer`) | `protocol.buildHandshakeOptions`, `ADMS_OPTION_OVERRIDES`, `ADMS_HANDSHAKE_TIMEZONE` | values from open-source references | Step 10: compare with the device's own requests in Wireshark |
| 14 | Device time zone (push timestamps have none) | `ADMS_DEVICE_UTC_OFFSET_MIN`; server receive time is always stored next to device time | 330 (IST) | Step 8: compare `device_time` and `server_received_utc` |
| 15 | `INFO=` field order on getrequest (firmware, counts, IP, algorithm) | `protocol.parseDeviceInfo` (raw string stored as `deviceInfoRaw`) | common order | Step 1: compare with `pilot info` (pyzk) |
| 16 | Does a full history upload happen on first handshake (`ATTLOGStamp=0`)? | punches are de-duplicated; punches older than `ADMS_REALTIME_WINDOW_SEC` are stored only | stamp 0 → device may upload everything once | Step 8: count `attlog` events after the first handshake |
| 17 | Legacy templates (node-zklib `CMD_USERTEMP_RRQ`, 8-byte header stripped) are valid X990 templates | `scripts/migrateLegacyTemplates.js` | migrated as finger 0 | Restore one migrated template and verify a finger before relying on it |
| 18 | pyzk works with the X990 firmware at all (packet size, `ZK_FORCE_UDP`) | `ZK_FORCE_UDP`, `ZK_TIMEOUT` | TCP | Step 1 |
| 19 | Push read-back: does `DATA QUERY FINGERTMP PIN=..\tFID=..` make the gate upload the template? | `SYNC_PUSH_READBACK`, capability `template_readback_push` | queued after every template write | Hardware test 9/10: is there a gate `template_upload` after the query? If never, set `HARDWARE_CAPABILITIES={"template_readback_push":"unsupported"}` and use the sidecar for read-back |
| 20 | Does the X990 menu refuse enrolling a finger that already belongs to another user? | — (backend only detects byte-identical templates) | — | Try enrolling the same finger under two user IDs on Device 1 |
| 21 | Can a gate *disable* a user instead of deleting? | not used: block deletes from the gates and restores from the stored template | delete | Only if a supported disable command is found |
| 22 | Pull mode (`zk_tcp_pull`): `get_attendance` record format and clock | `PULL_POLL_SECONDS`, sidecar `/attendance` | 30 s | Only for a unit that cannot push |
| 23 | Is an ack (Return=0) reliable proof that the template is stored? | `SYNC_ACK_COUNTS_AS_VERIFIED` | false (read-back required) | Compare acks with sidecar read-back over the pilot; switch only with evidence |

## Facts implemented as given (not unknown)

- Endpoints `GET/POST /iclock/cdata`, `GET /iclock/getrequest`, `POST /iclock/devicecmd`; replies `C:<id>:<command>` or `OK`.
- Acks `ID=..&Return=..&CMD=..`; codes 0, -1, -2, -1002, -1004.
- `USER ADD` / `USER DEL` are never used.
- User record is written before its template (queue priority, and `set_user` before `save_user_template` in the sidecar); `refresh_data` after ZK TCP writes.
- `clear_data` is never called (blocked in the sidecar wrapper, checked by a test).
- ATTLOG line `PIN\tTime\tStatus\tVerify\tWorkcode`, reply `OK`.
