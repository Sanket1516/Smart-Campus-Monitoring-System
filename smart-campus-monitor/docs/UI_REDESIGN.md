# Sentinel UI redesign: delivery report

## 1. Redesigned modules

| Area | What changed |
|---|---|
| Platform story (`/`, public) | 3D campus hero (admin building, backend core, entry/exit gates with terminals, live links, student movement) with a staged intro and a scroll-driven camera; 12 chapters (enrolment, sync, entry, exit, command centre, hostellers, exit approval, students + Excel, access control, terminals, notifications, analytics). Phones, reduced motion and no-WebGL get the 2D architecture diagram. |
| Login | Split screen: 3D campus + statement / labelled form with validation, caps-lock hint, show-password, loading state. JWT flow unchanged. |
| Console shell | Grouped, role-filtered navigation (Command, Identity, Safety, Infrastructure, Intelligence); top bar with campus name, clock, global student search (⌘K), real terminal connectivity, live-stream status, notifications, theme toggle, profile, logout. Page transitions. |
| Overview | Command header (inside now / entries / exits), live enrolment → gate topology, Device 2 / Device 3 panels from terminal roles, live event stream (socket events + today's recorded activity). |
| Student Management | Editorial header, server-side search / department / year / category / enrolment / gate-sync / access filters, pagination, Entry / Exit / overall sync columns. |
| Enrolment & Sync | Device 1 terminal visual driven by the real enrolment state, progress steps, capture result and retry. |
| Terminal Management | Device 1 / Terminal 01 (Entry) / Terminal 02 (Exit) hardware renderings with spec sheets (serial, machine number, mode, status, last heartbeat, last scan, activity, enrolment sync). |
| Terminal Sync | Editorial header (rest from the previous release). |
| Public live screen (`/live`) | Rebuilt as an anonymous display: counts, gate status, hourly chart, anonymised activity. |
| Gate Scanner | Scan result moved directly under manual entry, announced via `aria-live`; scanning logic unchanged. |
| Visitors (new page) | Visitor register by day with filter and pagination (existing `GET /api/visitors`). |
| Logs, Hostellers, Warden Portal, Access Control, Analytics, Settings | Editorial headers; the whole app re-themed through the design-system layer; Chart.js themed globally. |

## 2. Files

Created (frontend): `components/brand/{CampusScene3D,CampusStage,ArchitectureFlow,TerminalDevice,FingerprintGlyph,PageHeader,LiveEventStream,GateDeviceShowcase,terminalStatus}`, `components/platform/{primitives,StoryChapters,OperationsChapters}`, `pages/{Platform,Visitors}.jsx`, `hooks/useMotion.js`, `utils/chartTheme.js`, `tests/DeviceOverview.test.jsx`.

Modified (frontend): `index.html`, `tailwind.config.js`, `index.css`, `main.jsx`, `App.jsx`, `components/{Layout,StatCard,AlertBell,ExcelUploadModal}.jsx`, `components/sync/{SyncHealthPanel,SyncEnrollmentFlow,SyncStatusBadges}.jsx`, `context/SocketContext.jsx`, `pages/{Login,Dashboard,StudentManagement,Terminals,Enrollment,TerminalSync,PublicLiveDashboard,Scanner,StudentLogs,Hostellers,WardenPortal,AccessControl,Analytics,Settings}.jsx`, `utils/rolePermissions.js`, `services/api.js`, `tests/Login.test.jsx`.

Modified (backend): `services/socketService.js`, `socket.js`, `controllers/{liveController,studentController,terminalController}.js`, `routes/live.js`; new test `tests/socketPrivacy.test.js`.

## 3. Libraries introduced

- `three@0.169` and `@react-three/fiber@8.17`: the 3D campus. They are loaded lazily, only where the scene is shown.

Everything else uses existing dependencies plus CSS / SVG / IntersectionObserver. No GSAP or Framer Motion. Fonts (Space Grotesk, Inter, JetBrains Mono) come from Google Fonts.

## 4. Existing functionality preserved

All APIs, JWT authentication, role permissions, entry/exit logic, the terminal sync pipeline, hosteller approval rules, the manual SAP ID fallback, Excel upload and notifications are unchanged. Light mode is kept: the shell stays dark and the content area switches to light surfaces.

Behaviour changes (all fixes):

- **Socket privacy:** identifiable events go only to authenticated staff. Anonymous sockets receive `public:activity` without names, SAP IDs or photos. Before this, anyone could connect without logging in and receive every scan with the student's identity.
- **Student directory:** now paginated server-side. It previously showed only the first 50 students.
- **Search:** text is escaped before being used in a regular expression, and the category filter only accepts strings.
- **Dashboard socket cleanup:** leaving the dashboard no longer removes every `terminal:*` socket listener in the app.
- **Excel upload:** shows the duplicate count, taken from the server's own per-row errors.

## 5. Hardware integration changes

None in this phase. `/api/live` and `/api/terminals/status` now also return the terminal role (needed for the per-role displays). `/api/live/branding` is new: campus name and logo only.

## 6. Actual vs illustrative

- **Live, real data:** the console pages, the hero counts and gate lights on `/` (from `/api/live`), and the public live screen.
- **Illustrative:** every platform chapter panel. Each is marked "Illustrative · sample data" and uses invented names.
- **3D scene:** a procedural illustration of the architecture, not a model of a particular campus. Gate lights reflect real terminal status where it is available.
- **Device renderings:** stylised X990-class terminals, not product photos. Their screens show real status on the console pages.

## 7. Testing performed

- Frontend (Vitest): 9 tests pass. `vite build` succeeds. The main bundle went from 1.19 MB to 323 KB after route splitting.
- Backend (Jest): 92 of 93 pass. The failure is the old `auth.test.js` login test, which was already failing before this work.
- Visual review: headless Chromium (WebGL via SwiftShader) with intercepted API fixtures (review harness only, not committed). Covered: platform hero, story chapters and camera, login, Overview, Students, Terminals, Enrolment, Scanner, Logs, Hostellers, Warden, Access Control, Analytics, Settings, Terminal Sync and the live screen, in dark and light mode, plus a 390 px phone and an 834 px tablet. No horizontal overflow and no page errors.

## 8. Remaining limitations

- No test ran against a live backend + MongoDB, or with real terminals. API shapes were taken from the controllers.
- Light mode is a layer over dark-first components. Rare combinations may still need touch-ups.
- 3D rendering cost depends on the GPU. The render loop pauses off-screen, and phones get the 2D diagram.
- There are no video assets. Every animation is rendered in code, so no stock footage or unlicensed imagery is used.
- Older pages (Settings tabs, Warden Portal tables, Hosteller lists) were re-themed and given new headers but not restructured.
