# Real-hardware test plan (three X990 terminals)

**Status: NOT YET PERFORMED.** No result in this file may be filled in without running
the step on the real devices. Record evidence (pilot log line, screenshot, Wireshark
capture) for every row.

Setup: backend with `ADMS_PILOT_LOG=pilot-adms.jsonl`, sidecar with
`python -m scripts.pilot --log pilot-sidecar.jsonl …`, `SIMULATION_MODE=false`.

| # | Test | How | Expected | Evidence | Result |
|---|---|---|---|---|---|
| 1 | Register all three terminals | Terminals → register D1 (50), D2 (101), D3 (102) with real serials | all three online on Terminal Sync | handshake lines per SN | ☐ |
| 2 | Device 1 is ADMIN_ENROLLMENT | Terminal Sync device card 1 | role fixed, enrolment allowed only there | screenshot | ☐ |
| 3 | Device 2 is GATE_ENTRY | role select; try assigning GATE_ENTRY to D3 | second assignment rejected (409) | API error text | ☐ |
| 4 | Device 3 is GATE_EXIT | as above | — | — | ☐ |
| 5 | Register a test student | Student Management → Add | user ID assigned; USER_CREATE acked on D2, D3 | `command_ack` result 0 | ☐ |
| 6 | Capture fingerprint on Device 1 | Enrollment → Start; enrol on D1 menu | state *Captured* | — | ☐ |
| 7 | Actual template retrieved | push upload or *Fetch template* | `template_upload` (or sidecar `read_template`) with size + SHA-256 | log line | ☐ |
| 8 | Encrypted storage | `db.biometrictemplates.findOne()` in mongosh | only `dataEncrypted`/`dataIv`/`dataTag` binary + SHA-256, no base64 template | mongosh output (no template shown) | ☐ |
| 9 | Auto sync to Device 2 | wait for poll | D2 *Verified* | `command_ack` + read-back line, sha equal | ☐ |
| 10 | Auto sync to Device 3 | wait for poll | D3 *Verified*, overall FULLY_SYNCHRONIZED | as above | ☐ |
| 11 | Scan at entry gate | finger on D2 | device accepts the finger | device screen | ☐ |
| 12 | ENTRY event | Entry logs / `attlog` line | direction entry, EntryLog *entered* | log line | ☐ |
| 13 | Scan at exit gate | finger on D3 | device accepts | — | ☐ |
| 14 | EXIT event | as above | direction exit, EntryLog *exited* | — | ☐ |
| 15 | Block the student | Access Control → Block | BLOCK_PENDING → BLOCKED_REMOVED | delete acks on D2, D3 | ☐ |
| 16 | Both gates reject | finger on D2 and D3 | device does not identify the user | device screen; no ENTRY/EXIT recorded | ☐ |
| 17 | Unblock | Access Control → Unblock | restored, no recapture | TEMPLATE_WRITE acks + read-back | ☐ |
| 18 | Access restored | finger on D2 and D3 | identified; ENTRY / EXIT recorded | — | ☐ |
| 19 | Permanent de-enrolment | Sync drawer → De-enrol & erase | deletes on D1, D2, D3; DB templates 0 | acks; mongosh count | ☐ |
| 20 | Deletion verified | `pilot read-templates --ip <each>` | user absent on all three | sidecar log | ☐ |
| 21 | Disconnect one gate | unplug D3 network | D3 offline on dashboard | — | ☐ |
| 22 | Enrol another student | steps 5–7 | D2 Verified, D3 Pending → PARTIALLY_SYNCHRONIZED | dashboard | ☐ |
| 23 | Reconnect | plug D3 back | D3 polls again | handshake/getrequest lines | ☐ |
| 24 | Automatic recovery | wait | D3 Verified, FULLY_SYNCHRONIZED without admin action | acks + read-back | ☐ |

Also record for `HARDWARE_VERIFICATION.md`: dialect and push version per device, `Size=`
interpretation, whether D1 uploaded the template by itself, whether `DATA QUERY FINGERTMP`
returned the template (push read-back), and whether D1's menu refused a duplicate finger.
