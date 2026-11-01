# Bulk Student Enrollment (Excel)

Administrators enroll many students from one Excel file. Nothing is saved until the preview has been reviewed and
the enrollment is explicitly confirmed.

**Download template → fill → upload → validate → preview → confirm → enroll in batches → report**

## Using it

1. Sign in as an **administrator** (security guards and wardens cannot use it).
2. Student Management → **Upload Excel** → **Download template**.
3. Fill one student per row on the `Students` sheet and delete the grey sample row. The `Instructions` sheet
   lists every column, what is required and the allowed values. Dropdowns are provided for category, course,
   department, year and hostel.
4. Upload the `.xlsx` file. Every row is validated and duplicates are detected; the result is shown as a preview
   with filters, search and row-level error messages that quote the **Excel row number**.
5. Confirm. Valid new students are saved in batches while a progress bar follows the server's real counters.
6. Download the reports: full summary, enrolled, failed, invalid, duplicates and already-enrolled (all `.xlsx`).

## Columns (the real Student schema fields)

| Column | Required | Rule |
|---|---|---|
| sapId | yes | 9 to 11 digits (`SAP_ID_PATTERN`, same default as the gate scanner); kept as text, leading zeros preserved |
| name | yes | 2 to 100 characters, letters, spaces and `. ' -` |
| email | yes | valid email |
| category | yes | `dayscholars` or `hostellers` ("day scholar", "hosteller" also understood) |
| course | yes | `pharmacy`, `engineering`, `mbatech`, `pharmatech` |
| department | yes | must belong to the course (`bpharm`; `computer science` / `computer engineering`; `mbatech`; `pharmatech`) |
| year | no | whole number 1 to 5 |
| phone, parentPhone | no | 10 to 15 digits, optional `+` |
| parentEmail | no | valid email; a warning is shown if neither parent email nor phone is given (notifications need one) |
| address | no | up to 300 characters |
| bloodGroup | no | A+ A- B+ B- AB+ AB- O+ O- (anything else is left blank with a warning) |
| hostel | hostellers only | a registered hostel **name or code**; ignored for day scholars |
| roomNumber | no | hostellers only, up to 20 characters |

The schema has no date fields, so there are no date columns.

## Rules and safeguards

- `.xlsx` only (old `.xls` is refused with instructions to re-save), 5 MB and 5000 students per file
  (`BULK_MAX_FILE_MB`, `BULK_MAX_ROWS`). Files are parsed in memory, never written to disk.
- Duplicates are detected **inside the file** (first occurrence wins) and **against MongoDB**. Existing students
  are never overwritten; rows whose name/email differ from the stored record are flagged as conflicts.
- Duplicates are checked again right before every batch, and the unique index on `sapId` is the final guard, so
  concurrent uploads or two admins can never create a duplicate student. Every row ends as `enrolled`, `failed`
  or `skipped`; none is lost, and database problems are never reported as success.
- Batches of 200 (`BULK_BATCH_SIZE`) run in the background; the page polls `GET /api/students/bulk/:id`.
- If the server restarts mid-run, the run is marked failed on startup; students already saved are kept and a
  re-upload skips them.
- Reports neutralise spreadsheet formula injection (`=`, `+`, `-`, `@` prefixes).
- Audit log entries are written for validation, cancellation and enrollment. Runs are kept 30 days.

## API (all administrator-only)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/students/bulk/template` | download the template |
| POST | `/api/students/bulk/validate` | multipart `file`; parses, validates, returns the pending run |
| GET | `/api/students/bulk/:id` | status, totals, progress |
| GET | `/api/students/bulk/:id/rows?filter=&search=&page=` | preview / result rows |
| POST | `/api/students/bulk/:id/confirm` | start enrollment (202); a second confirm gets 409 |
| DELETE | `/api/students/bulk/:id` | discard an unconfirmed upload |
| GET | `/api/students/bulk/:id/report?type=` | `summary` `enrolled` `failed` `invalid` `duplicates` `existing` `skipped` `all` |

The old `POST /api/students/upload` (immediate insert, no preview) was retired and now returns 410.

## Gate machines and terminals

Enrolled students live in the central MongoDB. The ENTRY and EXIT gate machines look students up through the
existing student/scan APIs, so they can verify a new student immediately. The new students are also queued for
terminal provisioning with the existing `onStudentsImported` sync hook (user records only).

**Not covered:** fingerprint templates. Bulk enrollment creates the student record; the fingerprint is enrolled
separately on the admin enrollment terminal and then synchronised by the existing terminal-sync workflow. Excel
cannot carry biometric data.

## Tests

- Backend: `cd backend && npx jest tests/bulkEnrollment.unit.test.js tests/bulkEnrollment.api.test.js`
  (the API tests start a real in-memory MongoDB with the real unique indexes).
- Frontend: `cd frontend && npx vitest run src/tests/ExcelUploadModal.test.jsx`
