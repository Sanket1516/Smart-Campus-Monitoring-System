# Test results

Everything below ran **without hardware**. Terminals were simulated (fake ADMS terminal
over real HTTP, fake pyzk device in the sidecar); MongoDB was replaced by an in-memory
model fake because no MongoDB binary was available in the build environment. No result
here says anything about real X990 behaviour. See `HARDWARE_TEST_PLAN.md` for the
hardware tests, which have **not** been performed.

| Suite | Command | Result |
|---|---|---|
| Backend (Jest) | `cd backend && npx jest` | 91 tests: 90 passed, 1 failed — the failure is `tests/auth.test.js` (login), which already failed before this work |
| Sidecar (pytest) | `cd sidecar && pytest` | 17 passed |
| Frontend (Vitest) | `cd frontend && npx vitest run` | 8 passed; `vite build` succeeds |

Three-device scenarios covered by `backend/tests/sync/threeDevice.e2e.test.js` (SIMULATED):

- role duplication rejected (real and simulated counted separately)
- enrol on Device 1 → template stored encrypted → both gates written and read back →
  PARTIALLY_SYNCHRONIZED while Device 3 is offline → FULLY_SYNCHRONIZED after it reconnects
- Device 2 records only ENTRY, Device 3 only EXIT; duplicate punches ignored; exit without entry
- exit gate rejects the template → PARTIALLY_SYNCHRONIZED (never FULLY)
- gates acknowledge but cannot be read back → SYNCHRONIZED_UNVERIFIED
- block: gates only, Device 1 keeps the template, software deny at once → BLOCKED_REMOVED;
  unblock restores without recapture → FULLY_SYNCHRONIZED
- de-enrolment: all three devices and MongoDB; software deny before the devices process it
- enrolment timeout; identical template for a second student rejected
- templates uploaded by a gate are never stored as enrolments
- simulated enrolment device refused without SIMULATION_MODE; its templates never reach real gates
- pull-mode gate: queue executed and attendance pulled through the sidecar

Not tested anywhere yet: real MongoDB 7 (indexes, partial unique index), real X990 terminals,
real pyzk against an X990, the web UI against a live backend.
