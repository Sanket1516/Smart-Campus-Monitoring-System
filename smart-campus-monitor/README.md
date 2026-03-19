# Smart Campus Entry Monitoring System

A full-stack web application for real-time monitoring of student entry and exit at a college campus gate. Built with the MERN stack, the system uses webcam-based barcode scanning to identify students, automatically toggles between entry and exit states, tracks day scholars and hostellers separately, detects curfew violations, sends parent notifications via email and SMS, and provides an admin dashboard with rich analytics.

> **Academic Project** -- 3rd Year, B.E. Computer Science Engineering

---

## Quick Start

```bash
# 1. Make sure MongoDB is running locally (mongod)

# 2. Install dependencies
cd backend && npm install
cd ../frontend && npm install

# 3. Seed the database (from backend/)
cd ../backend
npm run seed

# 4. Start the backend (Terminal 1)
npm run dev
# → API running at http://localhost:5000

# 5. Start the frontend (Terminal 2)
cd ../frontend
npm run dev
# → App running at http://localhost:5173

# 6. Open http://localhost:5173 in your browser
#    Login: admin / admin123  (or  security1 / security123)
```

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [System Architecture](#system-architecture)
3. [Tech Stack](#tech-stack)
4. [Features](#features)
5. [Database Schema](#database-schema)
6. [API Endpoints](#api-endpoints)
7. [Project Structure](#project-structure)
8. [Installation and Setup](#installation-and-setup)
9. [Environment Variables](#environment-variables)
10. [Seed Data](#seed-data)
11. [Use Case Diagram](#use-case-diagram)
12. [Scan Logic Flowchart](#scan-logic-flowchart)
13. [Screenshots](#screenshots)
14. [Future Scope](#future-scope)
15. [Authors](#authors)
16. [License](#license)

---

## System Architecture

```
+---------------------------------------------------------------------+
|                          CLIENT  (Browser)                          |
|                                                                     |
|   +------------------+    +-------------------+    +--------------+ |
|   | React (Vite)     |    | html5-qrcode      |    | Chart.js     | |
|   | React Router DOM |    | Scanner (Webcam)  |    | Analytics    | |
|   | Tailwind CSS     |    |                   |    |              | |
|   | Axios HTTP       |    |                   |    |              | |
|   +--------+---------+    +--------+----------+    +------+-------+ |
|            |                       |                      |         |
+------------|--------- -------------|----------------------|---------+
             |  REST API  (JSON)     |                      |
             v                       v                      v
+---------------------------------------------------------------------+
|                        BACKEND  (Node.js)                           |
|                                                                     |
|   +------------------+    +-------------------+    +--------------+ |
|   | Express.js       |    | JWT Auth          |    | Notification | |
|   | REST API Routes  |    | Middleware        |    | Service      | |
|   | Controllers      |    | Role-based Access |    |              | |
|   +--------+---------+    +-------------------+    +---+-----+---+ |
|            |                                           |     |     |
|            |           +-------------------+           |     |     |
|            +---------->| Mongoose ODM      |           |     |     |
|                        | Models & Schemas  |           |     |     |
|                        +--------+----------+           |     |     |
|                                 |                      |     |     |
+---------------------------------------------------------------------+
                                  |                      |     |
                                  v                      v     v
                          +---------------+     +------+ +----------+
                          |   MongoDB     |     |SMTP  | | Fast2SMS |
                          |   Database    |     |Gmail | | API      |
                          +---------------+     +------+ +----------+
```

---

## Tech Stack

### Backend

| Technology         | Purpose                                    |
| ------------------ | ------------------------------------------ |
| Node.js            | Server-side JavaScript runtime             |
| Express.js 4.x     | Web framework and REST API routing          |
| MongoDB            | NoSQL document database                    |
| Mongoose 8.x       | MongoDB ODM with schema validation         |
| JSON Web Tokens    | Stateless authentication (Bearer tokens)   |
| bcryptjs           | Password hashing (12 salt rounds)          |
| Nodemailer         | SMTP email delivery to parents             |
| Fast2SMS API       | SMS notifications (India)                  |
| Helmet             | HTTP security headers                      |
| express-rate-limit | API rate limiting (200 req / 15 min)       |
| Morgan             | HTTP request logging (dev mode)            |
| express-validator  | Request body validation                    |
| dotenv             | Environment variable management            |

### Frontend

| Technology         | Purpose                                    |
| ------------------ | ------------------------------------------ |
| React 18           | Component-based UI library                 |
| Vite 5             | Fast development server and build tool     |
| React Router DOM 6 | Client-side routing with protected routes  |
| Tailwind CSS 3     | Utility-first CSS framework                |
| Axios              | HTTP client with interceptors              |
| html5-qrcode       | Real-time barcode scanning from webcam     |
| Tesseract.js 5     | OCR engine for reading printed SAP IDs     |
| Chart.js 4         | Bar, Line, and Doughnut chart rendering    |
| react-chartjs-2    | React wrapper for Chart.js                 |
| react-hot-toast    | Toast notification popups                  |
| react-icons        | Icon library (Heroicons outline set)       |

---

## Features

### Core Functionality

- **Webcam Barcode Scanning** -- Live camera feed decodes student ID card barcodes using the html5-qrcode webcam reader. A scan-target overlay guides the user to position the barcode within the frame.
- **OCR Number Reader** -- Alternative scanning mode using Tesseract.js OCR engine. Automatically detects the teal-colored strip on the college ID card, extracts the 11-digit SAP ID printed on it, and processes the scan. Auto-scans every 2 seconds with a manual capture button as fallback.
- **Manual SAP ID Entry** -- Fallback text input for manual entry when barcode scanning is not possible.
- **Smart Entry/Exit Toggle** -- The system automatically determines whether a scan is an entry or exit based on the student's current state for the day:
  - No log today --> **ENTRY**
  - Currently status `entered` --> **EXIT**
  - Currently status `exited` --> **RE-ENTRY** (new log)
- **Unauthorized Scan Detection** -- Scanned values not matching any active student SAP ID are logged as unauthorized attempts with timestamp and date.

### Student Management

- **Day Scholar / Hosteller Classification** -- Every student record has a `category` field distinguishing between day scholars and hostellers.
- **CRUD Operations** -- Admin users can create, read, update, and soft-delete (deactivate) student records.
- **Search and Filter** -- Students can be searched by name or SAP ID and filtered by category.

### Hosteller Monitoring

- **Curfew Violation Detection** -- If a hosteller exits after the configured curfew hour (default 22:00), the log is flagged with `lateReturn: true`.
- **Live Hosteller Status Table** -- Dedicated page showing each hosteller's current status (Inside Campus / Outside / No Activity), last scan time, and late-return alerts.
- **Filter Tabs** -- Quick filters for All, Outside, Late Return, and No Activity hostellers.
- **Auto-refresh** -- Hosteller data refreshes automatically every 30 seconds.

### Parent Notifications

- **Email Notifications** -- HTML-formatted entry/exit emails sent to the parent's registered email address via SMTP (Nodemailer).
- **SMS Notifications** -- Plain-text SMS sent via the Fast2SMS bulk API to the parent's registered phone number.
- **Fire-and-Forget** -- Notifications are dispatched asynchronously; scan response is not blocked.
- **Manual Trigger** -- Admin can manually trigger a notification via the `/api/notify` endpoint.

### Admin Dashboard

- **Real-time Statistics** -- Total students, currently inside campus, entries today, exits today, unauthorized attempts, hostellers outside, and late returns.
- **Hourly Entry/Exit Distribution** -- Bar chart showing entries and exits for each hour of the day.
- **7-Day Attendance Trend** -- Line chart plotting unique students and total scans over the past week.
- **Campus Population Curve** -- Area chart simulating the campus population throughout the day (cumulative entries minus exits).
- **Student Category Doughnut** -- Doughnut chart breaking down day scholars vs hostellers.
- **Peak Entry Hours** -- Top 5 busiest entry hours displayed as badges.
- **Date Selector** -- Analytics page allows picking any date to view historical hourly distribution.
- **Auto-refresh** -- Dashboard data refreshes every 30 seconds.

### Authentication and Authorization

- **JWT Authentication** -- Login returns a signed Bearer token stored in `localStorage`.
- **Role-based Access Control** -- Two roles: `admin` (full access) and `security` (scan and view access). Only admins can create/update/delete students and register new users.
- **Token Validation Middleware** -- All API routes except login are protected. Invalid/expired tokens trigger a 401 and automatic redirect to login.
- **Global 401 Interceptor** -- Axios response interceptor clears stored credentials and redirects to `/login` on any 401 response.

### Security

- **Helmet** -- Sets secure HTTP headers (Content-Security-Policy, X-Frame-Options, etc.).
- **CORS** -- Restricted to the configured `CLIENT_URL` origin.
- **Rate Limiting** -- 200 requests per 15-minute window per IP on all `/api/` routes.
- **Password Hashing** -- bcrypt with 12 salt rounds; passwords stored hashed, never in plain text.
- **Soft Delete** -- Students are deactivated (`isActive: false`) rather than permanently deleted.

### UI/UX

- **Responsive Layout** -- Desktop sidebar collapses into a mobile hamburger drawer.
- **Toast Notifications** -- Instant feedback on scan success, errors, and unauthorized attempts.
- **Processing Cooldown** -- 2-second debounce between scans to prevent duplicate processing.
- **Loading States** -- Animated spinners during data fetching.
- **Paginated Tables** -- Entry logs and student lists support server-side pagination.

---

## Database Schema

### `admins` Collection

| Field      | Type     | Constraints                         | Description                         |
| ---------- | -------- | ----------------------------------- | ----------------------------------- |
| `username` | String   | required, unique, trimmed           | Login username                      |
| `password` | String   | required, minlength 6, select:false | Bcrypt-hashed password              |
| `name`     | String   | required, trimmed                   | Display name                        |
| `role`     | String   | enum: `admin`, `security`           | Role for authorization              |
| `createdAt`| Date     | auto (timestamps)                   | Record creation timestamp           |
| `updatedAt`| Date     | auto (timestamps)                   | Record update timestamp             |

**Pre-save Hook:** Hashes `password` with bcrypt (12 rounds) before saving.
**Instance Method:** `comparePassword(candidate)` returns a boolean.

### `students` Collection

| Field         | Type    | Constraints                              | Description                          |
| ------------- | ------- | ---------------------------------------- | ------------------------------------ |
| `sapId`       | String  | required, unique, trimmed, indexed       | Student SAP identification number    |
| `name`        | String  | required, trimmed                        | Full name of the student             |
| `email`       | String  | required, trimmed, lowercase             | Student email address                |
| `parentEmail` | String  | trimmed, lowercase                       | Parent/guardian email for alerts      |
| `parentPhone` | String  | trimmed                                  | Parent/guardian phone for SMS         |
| `category`    | String  | required, enum: `day_scholar`, `hosteller` | Student residential category       |
| `department`  | String  | trimmed                                  | Academic department                  |
| `year`        | Number  | min 1, max 5                             | Current year of study                |
| `photoUrl`    | String  | default: `""`                            | URL to student photo                 |
| `isActive`    | Boolean | default: `true`                          | Soft-delete flag                     |
| `createdAt`   | Date    | auto (timestamps)                        | Record creation timestamp            |
| `updatedAt`   | Date    | auto (timestamps)                        | Record update timestamp              |

### `entrylogs` Collection

| Field         | Type   | Constraints                              | Description                                |
| ------------- | ------ | ---------------------------------------- | ------------------------------------------ |
| `sapId`       | String | required, indexed                        | Student SAP ID (foreign reference)         |
| `studentName` | String | required                                 | Denormalized student name                  |
| `category`    | String | enum: `day_scholar`, `hosteller`         | Denormalized student category              |
| `date`        | String | required, indexed (YYYY-MM-DD)           | Calendar date of the log                   |
| `entryTime`   | Date   | default: null                            | Timestamp of campus entry                  |
| `exitTime`    | Date   | default: null                            | Timestamp of campus exit                   |
| `status`      | String | enum: `entered`, `exited`                | Current state of this log record           |
| `lateReturn`  | Boolean| default: false                           | Whether this was a curfew violation        |
| `createdAt`   | Date   | auto (timestamps)                        | Record creation timestamp                  |
| `updatedAt`   | Date   | auto (timestamps)                        | Record update timestamp                    |

**Compound Index:** `{ sapId: 1, date: 1 }` for fast lookups.

### `unauthorizedlogs` Collection

| Field          | Type    | Constraints            | Description                              |
| -------------- | ------- | ---------------------- | ---------------------------------------- |
| `scannedValue` | String  | required               | The unrecognized barcode value           |
| `date`         | String  | required (YYYY-MM-DD)  | Calendar date of the attempt             |
| `timestamp`    | Date    | default: Date.now      | Exact timestamp of the scan              |
| `resolved`     | Boolean | default: false         | Whether admin has reviewed this incident |
| `notes`        | String  | default: `""`          | Admin notes upon resolution              |
| `createdAt`    | Date    | auto (timestamps)      | Record creation timestamp                |
| `updatedAt`    | Date    | auto (timestamps)      | Record update timestamp                  |

---

## API Endpoints

All endpoints are prefixed with `/api`. Endpoints marked with a lock require a valid JWT Bearer token in the `Authorization` header. Endpoints marked with **(admin)** additionally require the `admin` role.

### Authentication

| Method | Endpoint             | Auth       | Description                                  |
| ------ | -------------------- | ---------- | -------------------------------------------- |
| POST   | `/api/auth/login`    | Public     | Login with username/password; returns JWT     |
| GET    | `/api/auth/me`       | Protected  | Get current authenticated user profile        |
| POST   | `/api/auth/register` | Admin only | Register a new admin or security user         |

### Scan Processing

| Method | Endpoint     | Auth      | Description                                                     |
| ------ | ------------ | --------- | --------------------------------------------------------------- |
| POST   | `/api/scan`  | Protected | Process a barcode scan; auto-detects entry/exit/re-entry        |

**Request Body:** `{ "sapId": "500091001" }`
**Success Response:** `{ authorized, action, student, log }`
**Unauthorized Response (404):** `{ authorized: false, message, scannedValue }`

### Students

| Method | Endpoint                | Auth       | Description                                 |
| ------ | ----------------------- | ---------- | ------------------------------------------- |
| GET    | `/api/students`         | Protected  | List students (supports `?category`, `?search`, `?page`, `?limit`) |
| GET    | `/api/students/:sapId`  | Protected  | Get a single student by SAP ID              |
| POST   | `/api/students`         | Admin only | Create a new student record                 |
| PUT    | `/api/students/:sapId`  | Admin only | Update a student record                     |
| DELETE | `/api/students/:sapId`  | Admin only | Soft-delete (deactivate) a student          |

### Entry Logs

| Method | Endpoint                              | Auth      | Description                                        |
| ------ | ------------------------------------- | --------- | -------------------------------------------------- |
| GET    | `/api/logs`                           | Protected | List entry logs (supports `?date`, `?sapId`, `?category`, `?status`, `?page`, `?limit`) |
| GET    | `/api/logs/unauthorized`              | Protected | List unauthorized scan logs (supports `?date`, `?resolved`, `?page`, `?limit`) |
| PUT    | `/api/logs/unauthorized/:id/resolve`  | Protected | Mark an unauthorized log as resolved               |

### Dashboard & Analytics

| Method | Endpoint                  | Auth      | Description                                         |
| ------ | ------------------------- | --------- | --------------------------------------------------- |
| GET    | `/api/dashboard`          | Protected | Aggregated stats: totals, today counts, weekly trend |
| GET    | `/api/dashboard/hourly`   | Protected | Hourly entry/exit distribution (supports `?date`)    |
| GET    | `/api/dashboard/hostellers` | Protected | Current status of all hostellers                   |

### Notifications

| Method | Endpoint       | Auth      | Description                                         |
| ------ | -------------- | --------- | --------------------------------------------------- |
| POST   | `/api/notify`  | Protected | Manually trigger parent notification for a student   |

**Request Body:** `{ "sapId": "500091001", "action": "entry" }`

### Utility

| Method | Endpoint       | Auth   | Description                            |
| ------ | -------------- | ------ | -------------------------------------- |
| GET    | `/api/health`  | Public | Health check; returns `{ status: "ok" }` |

---

## Project Structure

```
smart-campus-monitor/
|
+-- .gitignore
+-- README.md
|
+-- backend/
|   +-- .env.example              # Environment variable template
|   +-- package.json              # Backend dependencies and scripts
|   +-- server.js                 # Express app entry point
|   |
|   +-- config/
|   |   +-- db.js                 # MongoDB connection (Mongoose)
|   |
|   +-- middleware/
|   |   +-- auth.js               # JWT protect + role-based authorize
|   |   +-- errorHandler.js       # Centralized error handler
|   |
|   +-- models/
|   |   +-- Admin.js              # Admin/security user schema
|   |   +-- Student.js            # Student schema
|   |   +-- EntryLog.js           # Entry/exit log schema
|   |   +-- UnauthorizedLog.js    # Unauthorized scan log schema
|   |
|   +-- controllers/
|   |   +-- authController.js     # Login, register, getMe
|   |   +-- scanController.js     # Barcode scan processing logic
|   |   +-- studentController.js  # Student CRUD operations
|   |   +-- logController.js      # Entry log and unauthorized log queries
|   |   +-- dashboardController.js # Dashboard aggregation queries
|   |
|   +-- routes/
|   |   +-- auth.js               # /api/auth routes
|   |   +-- scan.js               # /api/scan routes
|   |   +-- students.js           # /api/students routes
|   |   +-- logs.js               # /api/logs routes
|   |   +-- dashboard.js          # /api/dashboard routes
|   |   +-- notify.js             # /api/notify routes
|   |
|   +-- services/
|   |   +-- notification.js       # Email (Nodemailer) + SMS (Fast2SMS)
|   |
|   +-- utils/
|       +-- seed.js               # Database seed script
|
+-- frontend/
    +-- package.json              # Frontend dependencies and scripts
    +-- index.html                # HTML entry point
    +-- vite.config.js            # Vite config with API proxy
    +-- tailwind.config.js        # Tailwind CSS configuration
    +-- postcss.config.js         # PostCSS plugins
    |
    +-- src/
        +-- main.jsx              # React DOM render entry point
        +-- index.css             # Global styles and Tailwind directives
        +-- App.jsx               # Root component with routes
        |
        +-- context/
        |   +-- AuthContext.jsx    # Authentication context provider
        |
        +-- services/
        |   +-- api.js            # Axios instance and API functions
        |
        +-- components/
        |   +-- Layout.jsx        # Sidebar + top bar + Outlet
        |   +-- BarcodeScanner.jsx # html5-qrcode webcam barcode reader
        |   +-- StatCard.jsx      # Reusable statistic card
        |
        +-- pages/
            +-- Login.jsx         # Login page
            +-- Dashboard.jsx     # Dashboard with stat cards and charts
            +-- Scanner.jsx       # Gate scanner with webcam + manual input
            +-- StudentLogs.jsx   # Paginated entry/exit log table
            +-- Analytics.jsx     # Analytics charts (doughnut, bar, line)
            +-- Hostellers.jsx    # Hosteller monitoring table
            +-- Settings.jsx      # Application settings page
```

---

## Installation and Setup

### Prerequisites

- **Node.js** >= 18.x ([https://nodejs.org](https://nodejs.org))
- **MongoDB** >= 6.x running locally or a MongoDB Atlas connection URI
- **Git** (optional, for cloning)
- A modern web browser with webcam access (Chrome, Edge, or Firefox recommended)

### Step 1 -- Clone the Repository

```bash
git clone <repository-url>
cd smart-campus-monitor
```

### Step 2 -- Backend Setup

```bash
cd backend
npm install
```

Create the environment file by copying the template:

```bash
cp .env.example .env
```

Edit `.env` and fill in your values (see [Environment Variables](#environment-variables) below).

### Step 3 -- Frontend Setup

Open a new terminal:

```bash
cd frontend
npm install
```

### Step 4 -- Start MongoDB

If using a local MongoDB instance:

```bash
mongod
```

Or update `MONGO_URI` in `.env` with your MongoDB Atlas connection string.

### Step 5 -- Seed the Database

From the `backend/` directory:

```bash
npm run seed
```

This will:
- Clear all existing data in the database
- Insert 10 sample students (SAP IDs 500091001 -- 500091010)
- Create 2 admin/security users
- Generate ~7 days of sample entry/exit logs
- Insert 2 unauthorized scan log entries

### Step 6 -- Start the Backend Server

```bash
cd backend
npm run dev
```

The API server will start on **http://localhost:5000**.

### Step 7 -- Start the Frontend Dev Server

```bash
cd frontend
npm run dev
```

The React app will start on **http://localhost:5173**.
The Vite dev server proxies all `/api` requests to `http://localhost:5000`.

### Step 8 -- Open the Application

Navigate to **http://localhost:5173** in your browser.

**Default login credentials:**

| Role     | Username    | Password      |
| -------- | ----------- | ------------- |
| Admin    | `admin`     | `admin123`    |
| Security | `security1` | `security123` |

---

## Environment Variables

Create a `.env` file in the `backend/` directory (a template is provided in `.env.example`):

```env
# Server
PORT=5000                              # Port for the Express server
NODE_ENV=development                   # Environment mode (development / production)

# MongoDB
MONGO_URI=mongodb://localhost:27017/smart_campus   # MongoDB connection string

# JWT Authentication
JWT_SECRET=change_this_to_a_long_random_string     # Secret key for signing JWT tokens
JWT_EXPIRES_IN=7d                                  # Token expiration duration

# Email Notifications (Nodemailer via SMTP)
SMTP_HOST=smtp.gmail.com               # SMTP server host
SMTP_PORT=587                          # SMTP server port (587 for TLS)
SMTP_USER=your_email@gmail.com         # SMTP authentication username
SMTP_PASS=your_app_password            # SMTP authentication password (use App Password for Gmail)
EMAIL_FROM=Smart Campus <noreply@smartcampus.edu>  # Sender display name and email

# SMS Notifications (Fast2SMS - India)
FAST2SMS_API_KEY=your_fast2sms_api_key  # API key from fast2sms.com dashboard

# Hosteller Curfew
CURFEW_HOUR=22                         # Hour (24h format) after which exits are flagged as late

# CORS
CLIENT_URL=http://localhost:5173       # Allowed origin for CORS (frontend URL)
```

| Variable         | Required | Description                                                                 |
| ---------------- | -------- | --------------------------------------------------------------------------- |
| `PORT`           | No       | Defaults to `5000`                                                          |
| `NODE_ENV`       | No       | Defaults to `development`; set `production` to disable Morgan logging       |
| `MONGO_URI`      | Yes      | Full MongoDB connection URI                                                 |
| `JWT_SECRET`     | Yes      | Must be a long, random, unpredictable string                                |
| `JWT_EXPIRES_IN` | No       | Defaults to `7d`; accepts values like `1h`, `30d`, etc.                     |
| `SMTP_HOST`      | No*      | Required only if email notifications are desired                            |
| `SMTP_PORT`      | No*      | Required only if email notifications are desired                            |
| `SMTP_USER`      | No*      | Required only if email notifications are desired                            |
| `SMTP_PASS`      | No*      | For Gmail, use an App Password (not your account password)                  |
| `EMAIL_FROM`     | No*      | Display name and email for the From header                                  |
| `FAST2SMS_API_KEY` | No*    | Required only if SMS notifications are desired; obtain from fast2sms.com    |
| `CURFEW_HOUR`    | No       | Defaults to `22` (10:00 PM); exits after this hour flag `lateReturn: true`  |
| `CLIENT_URL`     | No       | Defaults to `http://localhost:5173`; update for production deployments      |

> *These variables are optional for basic operation but are required if you want email/SMS notifications to function.

---

## Seed Data

Run the seed script from the `backend/` directory:

```bash
npm run seed
```

### Seeded Students (11 records)

| SAP ID      | Name               | Category    | Department       | Year |
| ----------- | ------------------ | ----------- | ---------------- | ---- |
| 70552300067 | Sanket (Test Card) | Day Scholar | Computer Science | 3    |
| 500091001   | Aarav Sharma       | Day Scholar | Computer Science | 3    |
| 500091002   | Priya Patel     | Day Scholar | Computer Science | 3    |
| 500091003   | Rohan Gupta     | Hosteller   | Electronics      | 2    |
| 500091004   | Sneha Reddy     | Hosteller   | Mechanical       | 4    |
| 500091005   | Vikram Singh    | Day Scholar | Computer Science | 2    |
| 500091006   | Ananya Iyer     | Hosteller   | Civil            | 1    |
| 500091007   | Karthik Nair    | Day Scholar | IT               | 3    |
| 500091008   | Meera Joshi     | Hosteller   | Computer Science | 2    |
| 500091009   | Arjun Desai     | Day Scholar | Electronics      | 4    |
| 500091010   | Divya Kulkarni  | Day Scholar | Computer Science | 3    |

### Seeded Admin Users

| Username    | Password      | Role     | Display Name   |
| ----------- | ------------- | -------- | -------------- |
| `admin`     | `admin123`    | admin    | System Admin   |
| `security1` | `security123` | security | Gate Security  |

### Generated Data

- **Entry Logs:** ~7 days of randomized entry/exit records. Each student has an ~80% chance of attendance per day. Entry times range from 07:00--09:59 and exit times from 15:00--18:59. On the current day, approximately half the students remain inside (status `entered`).
- **Unauthorized Logs:** 2 sample unauthorized scan attempts (`UNKNOWN001`, `INVALID999`) dated today.

---

## Use Case Diagram

```
                          +-------------------------------+
                          |  Smart Campus Entry Monitor   |
                          +-------------------------------+
                          |                               |
    +----------+          |   +------------------------+  |
    | Security |----------+-->| Scan Student Barcode   |  |
    | Guard    |          |   +------------------------+  |
    |          |----------+-->| View Scan Result       |  |
    |          |          |   +------------------------+  |
    |          |----------+-->| Manual SAP ID Entry    |  |
    |          |          |   +------------------------+  |
    |          |----------+-->| View Entry Logs        |  |
    |          |          |   +------------------------+  |
    |          |----------+-->| View Dashboard         |  |
    +----------+          |   +------------------------+  |
                          |                               |
    +----------+          |   +------------------------+  |
    | Admin    |----------+-->| All Security actions   |  |
    |          |          |   +------------------------+  |
    |          |----------+-->| Add/Edit/Delete Student|  |
    |          |          |   +------------------------+  |
    |          |----------+-->| Register New Users     |  |
    |          |          |   +------------------------+  |
    |          |----------+-->| View Analytics         |  |
    |          |          |   +------------------------+  |
    |          |----------+-->| Monitor Hostellers     |  |
    |          |          |   +------------------------+  |
    |          |----------+-->| Resolve Unauthorized   |  |
    |          |          |   |   Scan Attempts        |  |
    |          |          |   +------------------------+  |
    |          |----------+-->| Trigger Notifications  |  |
    +----------+          |   +------------------------+  |
                          |                               |
    +----------+          |   +------------------------+  |
    | System   |----------+-->| Auto Entry/Exit Toggle |  |
    | (Auto)   |          |   +------------------------+  |
    |          |----------+-->| Detect Late Return     |  |
    |          |          |   +------------------------+  |
    |          |----------+-->| Log Unauthorized Scans |  |
    |          |          |   +------------------------+  |
    |          |----------+-->| Send Parent Email/SMS  |  |
    +----------+          |   +------------------------+  |
                          |                               |
    +----------+          |   +------------------------+  |
    | Parent   |<---------+---| Receive Email Alert    |  |
    |          |<---------+---| Receive SMS Alert      |  |
    +----------+          |   +------------------------+  |
                          +-------------------------------+
```

---

## Scan Logic Flowchart

```
                    +------------------+
                    | Barcode Scanned  |
                    | (or Manual Entry)|
                    +--------+---------+
                             |
                             v
                   +-------------------+
                   | POST /api/scan    |
                   | { sapId }         |
                   +--------+----------+
                            |
                            v
               +----------------------------+
               | Find Student by sapId      |
               | where isActive = true      |
               +--------+-------------------+
                        |
              +---------+---------+
              |                   |
              v                   v
      +-------+------+   +-------+--------+
      | NOT FOUND    |   | FOUND          |
      +--------------+   +----------------+
              |                   |
              v                   v
   +--------------------+  +--------------------------+
   | Create             |  | Find today's EntryLog    |
   | UnauthorizedLog    |  | for this sapId           |
   +--------------------+  +--------+-----------------+
              |                     |
              v            +--------+--------+-----------+
   +--------------------+  |                 |           |
   | Return 404         |  v                 v           v
   | authorized: false  | +--------+ +----------+ +----------+
   +--------------------+ |No log  | |Status:   | |Status:   |
                          |today   | |entered   | |exited    |
                          +---+----+ +----+-----+ +----+-----+
                              |           |            |
                              v           v            v
                     +----------+ +-----------+ +------------+
                     |Create new| |Set exitTime| |Create new |
                     |EntryLog  | |status=exited| |EntryLog  |
                     |status=   | |Check curfew| |status=    |
                     |entered   | |for hosteller| |entered   |
                     |entryTime | +-----------+ |(re-entry) |
                     |= now     |      |       +------------+
                     +----------+      |            |
                          |            v            |
                          |   +---------------+     |
                          |   |Hour >= CURFEW?|     |
                          |   +---+-------+---+     |
                          |       |       |         |
                          |      Yes      No        |
                          |       |       |         |
                          |       v       |         |
                          | +----------+  |         |
                          | |lateReturn|  |         |
                          | |= true    |  |         |
                          | +----------+  |         |
                          |       |       |         |
                          +---+---+---+---+---------+
                              |       |
                              v       v
                     +---------------------+
                     | action = entry/exit  |
                     +----------+----------+
                                |
                                v
                   +---------------------------+
                   | notifyParent(student,     |
                   |   action, timestamp)      |
                   | (async, fire-and-forget)  |
                   +---------------------------+
                          |             |
                          v             v
                   +-----------+  +-----------+
                   | Send Email|  | Send SMS  |
                   | (SMTP)    |  | (Fast2SMS)|
                   +-----------+  +-----------+
                                |
                                v
                   +---------------------------+
                   | Return JSON response      |
                   | { authorized: true,       |
                   |   action, student, log }  |
                   +---------------------------+
```

---

## Screenshots

> Replace the placeholder paths below with actual screenshot images.

### Login Page
```
[ Screenshot: Login page with username/password fields ]
```
`screenshots/login.png`

### Dashboard
```
[ Screenshot: Dashboard with stat cards, hourly bar chart, weekly trend line chart ]
```
`screenshots/dashboard.png`

### Gate Scanner
```
[ Screenshot: Webcam barcode scanner with scan result card ]
```
`screenshots/scanner.png`

### Entry Logs
```
[ Screenshot: Paginated entry/exit log table with filters ]
```
`screenshots/logs.png`

### Analytics
```
[ Screenshot: Analytics page with doughnut chart, trend lines, and population curve ]
```
`screenshots/analytics.png`

### Hosteller Monitoring
```
[ Screenshot: Hosteller status table with filter tabs and alert badges ]
```
`screenshots/hostellers.png`

---

## Future Scope

1. **Face Recognition** -- Integrate a face detection model (e.g., face-api.js or a Python microservice with OpenCV/dlib) alongside barcode scanning for two-factor identification.
2. **QR Code Support** -- Generate per-student QR codes that encode the SAP ID, enabling phone-based scanning with any QR reader.
3. **Mobile Application** -- Build a React Native or Flutter companion app for security guards to scan on-the-go using the phone camera.
4. **Push Notifications** -- Implement Firebase Cloud Messaging (FCM) for real-time browser and mobile push alerts to parents.
5. **Attendance Integration** -- Connect entry logs with the college LMS or ERP system to auto-mark lecture attendance based on campus presence.
6. **RFID / NFC Support** -- Support RFID card readers or NFC tap at gate turnstiles as an alternative to barcode scanning.
7. **Geo-fencing** -- Use the browser Geolocation API to verify that scans are performed within the campus premises only.
8. **Multi-gate Support** -- Extend the schema to track which physical gate the student entered/exited from.
9. **Automated Reporting** -- Generate daily/weekly PDF reports summarizing attendance, late returns, and unauthorized attempts, and email them to administrators.
10. **Visitor Management** -- Add a separate workflow for visitor registration, approval, and tracking.
11. **Role Expansion** -- Introduce additional roles such as warden, HOD, and parent (view-only) with granular permissions.
12. **Containerization** -- Dockerize the application with Docker Compose for single-command deployment.
13. **CI/CD Pipeline** -- Set up GitHub Actions for automated testing, linting, and deployment.

---

## Authors

| Name | Role | Department |
| ---- | ---- | ---------- |
|      |      | Computer Science Engineering |
|      |      | Computer Science Engineering |
|      |      | Computer Science Engineering |
|      |      | Computer Science Engineering |

> Fill in the author names and roles as applicable.

**Guide / Mentor:**
Prof. _______________
Department of Computer Science and Engineering

---

## License

This project is developed for academic purposes as part of the 3rd Year Computer Science Engineering curriculum. All rights reserved by the authors.

For inquiries regarding reuse or redistribution, contact the authors listed above.

---

<p align="center">
  <strong>Smart Campus Entry Monitoring System</strong><br>
  Built with the MERN Stack<br>
  Node.js &bull; Express &bull; MongoDB &bull; React &bull; Vite &bull; Tailwind CSS
</p>
