# Parent Email Notifications

Premium entry / exit emails sent to a student's parent email each time a scan is recorded.

## How it works

```
scan (terminal / gate scanner)
  -> notifyParent(student, action, time, event)        services/notification.js
       -> composeParentEmail(...)                      services/emailTemplates/index.js
            1. loads branding (college name/logo/timezone) from system config
            2. loads today's EntryLog rows for the student
            3. buildContext(...)   real data -> view model       context.js
            4. render(ctx)         view model -> html + text     render.js
       -> sendEmail({ to, subject, text, html, attachments })  (existing nodemailer + SMTP_* env)
```

If template rendering throws, `notifyParent` falls back to the previous basic email, so a template bug never blocks a notification. Entry/exit detection, auth and the database schema are untouched.

`notifyParent` has one new **optional** 4th argument, `event`, so existing callers keep working:

| Caller | `event` |
|---|---|
| Terminal scan (`fingerprintController`) | `{ source: 'terminal', verifyMode, terminal, log }` |
| Gate scanner (`scanController`) | `{ source: 'sap_scan', log }` |
| Manual `/api/notify` | none (fields show "Not Available") |

## Where each value comes from

| Email field | Source | If missing |
|---|---|---|
| Name, department, year, category | `Student` | Not Available |
| SAP ID | `Student.sapId`, shown masked (last 4 digits only) | Not Available |
| Time / date | the scan timestamp, in the configured timezone | - |
| Gate, terminal, location | terminal (`gateName/gateNumber/terminalLabel/terminalNumber/location`) else the saved `EntryLog` | Not Available |
| Verification method | the real event (see below) | Not Available |
| First entry / last exit / time on campus | today's `EntryLog` rows | Not Available / Not exited yet |
| College name / logo | system config `collegeName` / `collegeLogo` | generic name / system emblem |

Raw device serial numbers, database IDs and the unmasked SAP ID are never included.

### Verification method (never guessed)

- `source: 'sap_scan'` -> "SAP ID scan at gate (manual verification)" - **never** labelled biometric.
- `source: 'terminal'` with ZKTeco verify code `1` -> Fingerprint (biometric); `15` -> Face recognition (biometric); `0` -> PIN; `2` -> RFID card.
- Terminal scan with no/unknown verify code -> "Gate terminal scan (method not reported)".

### Today's Campus Activity

Logs are flattened into time-ordered entry/exit events and paired entry -> exit. Only complete, adjacent pairs are summed. An exit with no matching entry, or an entry that never got an exit before the next entry, is **excluded** and the email says so. The exit email shows the duration of the visit that this exit closes plus the total of completed visits; if that visit has no matching entry it shows "Not Available".

## Optional configuration (`backend/.env`)

All optional; anything unset is left out of the email (never invented).

| Variable | Effect |
|---|---|
| `ADMIN_CONTACT_PHONE` | phone line in "Need Assistance?" |
| `SUPPORT_EMAIL` | support mailto link + footer link |
| `PARENT_PORTAL_URL` | "Open the secure parent portal" link |
| `PRIVACY_URL` | footer privacy link |
| `EMAIL_INCLUDE_STUDENT_PHOTO=true` + `PUBLIC_BASE_URL` (https) | include the student photo (off by default for privacy) |

The college logo comes from Settings -> `collegeLogo` and must be an absolute HTTPS URL; otherwise the system emblem is used.

## Email-client compatibility

- Table layout, inline CSS, no JavaScript, no external CSS.
- A small `<style>` block adds mobile stacking (Gmail / Apple Mail honour it; Outlook desktop ignores it and shows the 2-column layout).
- Icons and the header illustration are PNGs attached **inline (CID)**, because Gmail/Outlook do not render SVG and block remote images by default. Source SVGs: `assets/icons.js`; regenerate with `npm run email:assets` (needs Edge/Chrome).
- Plain-text alternative is always sent.
- Header uses a solid navy background with an optional gradient; clients without gradient support fall back to solid navy.

## Preview and tests

```bash
npm run email:preview      # renders 12 scenarios to backend/email-previews/ (open index.html)
npx jest tests/emailTemplates.test.js
```

Preview uses fixture data only (`services/emailTemplates/fixtures.js`): nothing is sent and the database is not touched.

Scenarios covered: day scholar and hosteller entry/exit, missing photo/department/gate, manual SAP ID, biometric, PIN, unreported method, exit without an entry record, multiple visits, re-entry, long/hostile names.

## Files

```
services/emailTemplates/
  index.js      compose (DB lookups + attachments)
  context.js    real data -> view model, verification mapping
  activity.js   entry/exit pairing and durations
  render.js     HTML + plain text
  helpers.js    escaping, masking, formatting
  fixtures.js   preview/test data only
  assets/       icon sources + generated PNGs
scripts/previewEmails.js, scripts/buildEmailAssets.js
tests/emailTemplates.test.js
```
