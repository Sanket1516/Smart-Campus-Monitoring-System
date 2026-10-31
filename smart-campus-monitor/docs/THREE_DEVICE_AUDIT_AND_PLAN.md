# Three-device integration: audit and implementation plan

Scope: one X990 as **ADMIN_ENROLLMENT** (admin office), one as **GATE_ENTRY**, one as
**GATE_EXIT**. The backend is the source of truth for identity, enrolment, sync state
and attendance.

## 1. Repository state at the start of this phase

- `claude/gallant-einstein-61sr02` held the terminal-sync work (ADMS push server, command
  queue, sync service, pyzk sidecar, reconciliation, UI, docs; 79/80 Jest tests passing;
  the failing one is the old `auth.test.js` login test).
- `main` received `bed0b3e`, a second, independent implementation of the ADMS server,
  queue and biometric models (same model names, same `/iclock` routes, tests that need
  `mongodb-memory-server`). The two cannot run side by side. The branch keeps its own
  implementation (which everything else is built on) and drops main's duplicate modules
  in a merge commit; `bed0b3e` stays in history. Ideas worth keeping from it (binding the
  ciphertext to student + finger via AES-GCM AAD) are ported.

## 2. Audit

| Area | Reusable as is | Gap for the three-device design |
|---|---|---|
| Terminal model (`TerminalConfig`) | SN, IP, firmware, algorithm, dialect, push version, groups, enabled, last seen/sync | no `deviceRole` (ENTRY/EXIT), no model / protocol / simulated fields, no role-duplication check |
| Attendance (`processTerminalScanEvent` → `processEntryExit`) | maintenance, registered terminal, known student, blocked, warden approval, notifications, live events | direction is a **toggle** (entry/exit alternates per day), not taken from the terminal; no duplicate-punch window |
| Enrolment (`enrollmentService`) | menu / pyzk_remote / push_remote, consent check, template fetch | no enrolment state machine (waiting / captured / failed / timeout), no timeout, no retry state, no duplicate-template check |
| Template store | AES-256-GCM, SHA-256, never returned | ciphertext not bound to the student (no AAD); no "simulated" marking |
| Queue + acks | persistent, dedupe, retries, alerts | ack = "stored" only; no **read-back verification** state; no per-student overall status (FULLY / PARTIALLY synchronized) |
| Block | software deny + delete on every terminal | deletes from the enrollment terminal too (requirement: keep the template on Device 1 unless de-enrolled) |
| De-enrol | deletes everywhere + erases DB | no software deny for a de-enrolled student whose delete has not been processed yet |
| Sidecar (pyzk) | users / templates / write / delete / backup / bulk | no attendance pull, no capability report; no pull-mode terminals (all terminals assumed to push) |
| Simulation | fake terminal + fake sidecar for tests | nothing labels simulated data; a simulated template could be fanned out to a real terminal |
| UI | Terminal Sync page, drawer, enrolment flow | no per-role device overview, no Entry/Exit sync columns, no enrolment progress / retry, no SIMULATED labels |

Incorrect or unverified device assumptions (all kept configurable, see `HARDWARE_VERIFICATION.md`):
push dialect, `Size=` unit, menu auto-upload of templates, remote enrolment, multiple `C:` lines,
TLS, 4370 session limit, whether a push template query (`DATA QUERY FINGERTMP`) returns the
template (needed for push-only read-back), whether the X990 refuses a duplicate finger on the menu.

Security issues found: none new beyond the ones already handled (no ADMS auth → VLAN + IP
allow-list + registered SN; templates encrypted; secrets required at startup). Added: refuse
simulated terminals unless `SIMULATION_MODE=true`, refuse `SIMULATION_MODE` in production.

Data-consistency risks: two terminals both claiming GATE_ENTRY; a template uploaded by a gate
being stored as a new enrolment; a simulated template reaching real hardware; full sync being
reported from acks alone. Each is addressed below.

## 3. Plan (implemented in this phase)

1. **Device roles** – `deviceRole` = ADMIN_ENROLLMENT | GATE_ENTRY | GATE_EXIT | GATE_TOGGLE
   (legacy), plus `deviceModel`, `communicationProtocol` (`adms_push` | `zk_tcp_pull`),
   `simulated`. Roles in `UNIQUE_DEVICE_ROLES` (default the three) may exist once.
2. **Enrolment** – only ADMIN_ENROLLMENT terminals may supply templates; enrolment state machine
   with timeout, failure and retry; exact-duplicate template check; template ciphertext bound to
   student + finger (AAD).
3. **Sync with verification** – per gate and per finger: pending → stored (ack 0) → verified
   (read-back SHA-256 matches, via sidecar or push template query). Student `syncStatus`:
   NOT_ENROLLED, PENDING, PARTIALLY_SYNCHRONIZED, SYNCHRONIZED_UNVERIFIED, FULLY_SYNCHRONIZED,
   FAILED, BLOCK_PENDING, BLOCKED_REMOVED. FULLY only when every target gate is *verified*.
4. **Attendance** – direction from the terminal role (GATE_ENTRY → entry, GATE_EXIT → exit,
   GATE_TOGGLE keeps the old behaviour); duplicate window `ATTENDANCE_DEDUPE_SECONDS`.
5. **Block / unblock** – delete on gate terminals only; enrolment device keeps the template;
   restore from the stored template.
6. **De-enrol** – delete on all terminals incl. Device 1, erase DB templates, deny in software.
7. **Sidecar / adapters** – role adapters with an explicit capability matrix; pull-mode terminals
   (commands executed and attendance polled through the sidecar); sidecar `/capabilities` and
   `/attendance`; unsupported operations fail loudly.
8. **Simulation mode** – everything from simulated terminals is labelled SIMULATED and never sent
   to real terminals; three-device simulator script.
9. **UI** – three-role device overview, Entry/Exit/overall sync columns, enrolment progress/retry,
   SIMULATED labels.
10. **Docs** – deployment, three-device configuration, network, troubleshooting, backup/restore,
    security, 24-step hardware test plan, test results (simulated only).
