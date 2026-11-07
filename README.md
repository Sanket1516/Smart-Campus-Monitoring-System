<div align="center">

# Smart Campus Entry Monitoring System

![React](https://img.shields.io/badge/React_18-20232A?logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?logo=mongodb&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-010101?logo=socketdotio&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-06B6D4?logo=tailwindcss&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![AWS](https://img.shields.io/badge/AWS_ECS-FF9900?logo=amazonaws&logoColor=white)

<img src="docs/screenshots/00-platform.jpg" alt="Sentinel platform landing page: One Campus. Two Gates. Complete Control." width="900" />

</div>

A full-stack MERN application for real-time monitoring of student entry and exit at a campus gate. Biometric terminals (eSSL X990, ADMS push) are the primary input; SAP ID entry at the gate desk is the manual fallback.

> Academic project, 3rd year B.Tech Computer Science. Mentor: Prof. Dr. Nitin Choubey.

## Screenshots

> Real captures of the running app in simulation mode (no terminal hardware), with the seed students and live scans made through the gate API: 7 day-scholar entries, 2 exits, 2 unknown IDs, and 3 hosteller exits refused because no warden approval existed.

### Admin dashboard

<p align="center">
  <img src="docs/screenshots/03-dashboard.jpg" alt="Admin dashboard: inside/outside counts and the inside-campus student list" width="880" />
</p>

| Gate scanner (barcode camera + manual SAP ID) | Entry logs |
|:---:|:---:|
| <img src="docs/screenshots/04-scanner.jpg" alt="Gate scanner page" width="430" /> | <img src="docs/screenshots/05-logs.jpg" alt="Entry and exit logs with status" width="430" /> |
| **Analytics** | **Hosteller monitoring** |
| <img src="docs/screenshots/06-analytics.jpg" alt="Analytics charts" width="430" /> | <img src="docs/screenshots/07-hostellers.jpg" alt="Hosteller monitoring with curfew status" width="430" /> |
| **Student management (Excel upload)** | **Fingerprint enrolment** |
| <img src="docs/screenshots/08-students.jpg" alt="Student management table" width="430" /> | <img src="docs/screenshots/09-enrollment.jpg" alt="Fingerprint enrolment progress" width="430" /> |
| **Access control (unauthorised attempts)** | **Terminal sync (3-device architecture)** |
| <img src="docs/screenshots/10-access-control.jpg" alt="Access control page" width="430" /> | <img src="docs/screenshots/13-terminal-sync.jpg" alt="Terminal sync health" width="430" /> |
| **Public live dashboard** | **Settings: hostels and staff** |
| <img src="docs/screenshots/01-live-public.jpg" alt="Public live dashboard with hourly movement chart" width="430" /> | <img src="docs/screenshots/14-settings.jpg" alt="Settings with hostel management" width="430" /> |

### Parent notifications and mobile

| Entry email (desktop) | Entry email (mobile) | Exit email (mobile) | Hosteller exit request |
|:---:|:---:|:---:|:---:|
| <img src="smart-campus-monitor/docs/email-screenshots/entry-desktop.png" alt="Entry notification email" width="200" /> | <img src="smart-campus-monitor/docs/email-screenshots/entry-mobile.png" alt="Entry email on mobile" width="170" /> | <img src="smart-campus-monitor/docs/email-screenshots/exit-mobile.png" alt="Exit email on mobile" width="170" /> | <img src="docs/screenshots/15-exit-request-mobile.jpg" alt="Hosteller exit request login on a phone" width="170" /> |

<details>
<summary>Login page</summary>
<img src="docs/screenshots/02-login.jpg" alt="Login page" width="700" />
</details>

## Features

- **Entry / exit / re-entry** decided automatically from each student's state for the day; unknown IDs are logged as unauthorized attempts.
- **Day scholar and hosteller tracking**, curfew-violation flags, warden-approved exit windows, blocked-student enforcement.
- **Biometric terminal integration** with authenticated scan payloads and live terminal heartbeat.
- **Role-based access** for `admin`, `security` and `warden`; Helmet, rate limiting and request validation on the API.
- **Parent notifications** by email (Nodemailer) and SMS (Fast2SMS).
- **Dashboards and analytics** with Chart.js, live updates over Socket.IO, Excel bulk enrolment.
- **Deployment:** Dockerised frontend (Nginx) and backend; a GitHub Actions workflow builds images to Amazon ECR and deploys to ECS Fargate.

## Tech stack

| Layer | Technologies |
|---|---|
| Frontend | React 18, Vite 5, React Router 6, Tailwind CSS 3, Axios, Chart.js, socket.io-client |
| Backend | Node.js, Express 4, Mongoose 8, JWT, bcryptjs, Socket.IO, Nodemailer |
| Database | MongoDB |
| DevOps | Docker, GitHub Actions, Amazon ECR / ECS Fargate / ALB |

## Architecture

```
React (Vite) ──REST/JSON + Socket.IO──► Express API ──► MongoDB
                                        │  JWT auth + RBAC middleware
                                        └─► Notification service ──► SMTP / SMS
Biometric terminals ──authenticated scan events──► Express API
```

## Quick start

Requires Node.js and a running MongoDB.

```bash
# Backend
cd smart-campus-monitor/backend
npm install
cp .env.example .env     # set MONGO_URI, JWT_SECRET (32+ chars) and TEMPLATE_ENC_KEY
npm run seed             # resets student data and creates demo accounts
npm run dev              # API on http://localhost:5000

# Frontend (second terminal)
cd smart-campus-monitor/frontend
npm install
npm run dev              # App on http://localhost:5173
```

Generate a secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
Demo logins created by the seed script: `admin / admin123`, `security1 / security123`. These are for local use only; change them before any real deployment.

## Documentation

| Topic | Where |
|---|---|
| Full documentation (schema, every API endpoint, scan-logic flowchart, AWS CI/CD guide, terminal sync) | [`docs/FULL_DOCUMENTATION.md`](docs/FULL_DOCUMENTATION.md) |
| API reference | [`smart-campus-monitor/docs/API.md`](smart-campus-monitor/docs/API.md) |
| AWS deployment roadmap | [`smart-campus-monitor/docs/AWS-DEPLOYMENT-ROADMAP.md`](smart-campus-monitor/docs/AWS-DEPLOYMENT-ROADMAP.md) |
| Hardware verification and pilot checklist | [`smart-campus-monitor/HARDWARE_VERIFICATION.md`](smart-campus-monitor/HARDWARE_VERIFICATION.md), [`smart-campus-monitor/PILOT_CHECKLIST.md`](smart-campus-monitor/PILOT_CHECKLIST.md) |

## Project layout

```
smart-campus-monitor/
├── backend/     Express API (controllers, models, routes, middleware, services, tests)
├── frontend/    React + Vite app (Nginx Dockerfile)
├── sidecar/     Terminal sync helper (see its README)
├── docs/        API, deployment and hardware docs
└── docker-compose.yml
.github/workflows/deploy.yml   ECR + ECS deployment
```

## Author

Sanket Mali · [GitHub](https://github.com/Sanket1516)
Licensing: academic project, all rights reserved by the authors (see the full documentation).
