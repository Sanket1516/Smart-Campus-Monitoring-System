# Demo setup

Run `start-demo.bat` (double-click or from a terminal). It will:
1. `npm run demo` - set the DB to the demo roster (staff for every role, 16 students, parent emails routed to the 4 demo inboxes). Idempotent.
2. Regenerate `Demo_Credentials.docx` in this folder (logins, students, emails).
3. Start backend (:5000) and frontend (:5173) and open the browser.

Edit the roster in `backend/utils/seedDemo.js` (`KEEP_SAP_IDS`, `DEMO_STUDENTS`, `STAFF`).
Requires `backend/.env` (MONGO_URI, JWT_SECRET, TEMPLATE_ENC_KEY) and Python with `python-docx`.

Staff logins: admin/admin123, admin2/admin123, warden1/warden123, warden2/warden123, security1/security123, security2/security123.
