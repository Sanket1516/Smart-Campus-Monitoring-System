# Test Credentials & Quick Start Guide

## 🔑 Default Login Credentials

### Current Seeded Accounts (in seed.js)

**Admin Account:**
- Username: `admin`
- Password: `admin123`
- Role: `admin`
- Access: Full system access

**Security Account:**
- Username: `security1`
- Password: `security123`
- Role: `security`
- Access: Dashboard, Scanner, Logs (view-only)

### ⚠️ Missing: Warden Account

**The seed script currently does NOT include a warden account.**

To create a warden account, you have two options:

#### Option 1: Add to seed.js (Recommended for testing)
Edit `backend/utils/seed.js` line 30-33 to include:

```javascript
const admins = [
  { username: 'admin', password: 'admin123', name: 'System Admin', role: 'admin' },
  { username: 'security1', password: 'security123', name: 'Gate Security', role: 'security' },
  { username: 'warden1', password: 'warden123', name: 'Hostel Warden', role: 'warden' },
];
```

Then run: `npm run seed`

#### Option 2: Register via Admin Panel
1. Login as admin (admin/admin123)
2. Navigate to Settings or Staff Management
3. Create new staff member with role "warden"

---

## 📝 Student Exit Request Page

### Public Access (No Login Required)

**URL:** `/student/exit-request`

**Purpose:** Students can submit hostel exit requests for approval

**How it works:**
1. Student enters their SAP ID
2. System fetches their profile (must be a hosteller)
3. Student fills out:
   - Reason (Medical, Family Visit, Personal Work, Emergency, Other)
   - Reason details
   - Requested exit time
   - Expected return time
4. Request is sent to assigned warden for approval
5. Student can check status using the same page

**Test SAP IDs (Hostellers from seed.js):**
- `500091003` - Rohan Gupta
- `500091004` - Sneha Reddy
- `500091006` - Ananya Iyer
- `500091008` - Meera Joshi

**Warden Approval:**
- Wardens see requests in `/admin/warden-portal`
- Can approve or reject with notes
- Students see status update on exit request page

---

## 🚀 Quick Start

### 1. Run Database Seed
```bash
cd backend
npm run seed
```

This creates:
- ✅ 11 sample students (mix of day scholars and hostellers)
- ✅ 2 admin accounts (admin, security)
- ✅ 7 days of entry logs
- ✅ Sample unauthorized access logs

### 2. Start Backend
```bash
cd backend
npm start
```

### 3. Start Frontend
```bash
cd frontend
npm run dev
```

### 4. Test the System

**Test Admin Access:**
1. Go to `http://localhost:5173/login`
2. Login: `admin` / `admin123`
3. Should see ALL menu items
4. Can access all pages

**Test Security Access:**
1. Logout, then login: `security1` / `security123`
2. Should only see: Dashboard, Scanner, Logs
3. Attempting to access `/analytics` shows "Access Denied"

**Test Warden Access (after creating warden account):**
1. Create warden account first
2. Login as warden
3. Should see: Dashboard, Logs, Analytics, Hostellers, Warden Portal
4. In Warden Portal, can approve/reject hostel exit requests

**Test Student Exit Request:**
1. Go to `http://localhost:5173/student/exit-request` (no login needed)
2. Enter SAP ID: `500091003`
3. Fill exit request form
4. Submit
5. Login as warden to approve/reject

---

## 🎯 Role-Based Access Matrix

| Page/Feature | Admin | Warden | Security |
|-------------|-------|--------|----------|
| Dashboard | ✅ | ✅ | ✅ |
| Scanner | ✅ | ❌ | ✅ |
| Logs | ✅ | ✅ | ✅ |
| Analytics | ✅ | ✅ | ❌ |
| Hostellers | ✅ | ✅ | ❌ |
| Enrollment | ✅ | ❌ | ❌ |
| Access Control | ✅ | ❌ | ❌ |
| Warden Portal | ✅ | ✅ | ❌ |
| Terminals | ✅ | ❌ | ❌ |
| Settings | ✅ | ❌ | ❌ |

---

## 📱 Student Pages (Public Access)

| Page | URL | Purpose |
|------|-----|---------|
| Exit Request | `/student/exit-request` | Submit & check hostel exit requests |
| Live Dashboard | `/live` | Public entry/exit monitoring display |

---

## 🔧 Creating New Accounts

### Via Command Line (Direct DB)
```javascript
// Connect to MongoDB and run:
use smart_campus;
db.admins.insertOne({
  username: "warden1",
  password: "$2a$10$hashedpassword...", // Use bcrypt to hash
  name: "Warden Name",
  role: "warden",
  isActive: true
});
```

### Via API (Requires Admin Login)
```bash
POST /api/auth/register
Headers: Authorization: Bearer <admin_token>
Body: {
  "username": "warden1",
  "password": "warden123",
  "name": "Warden Name",
  "role": "warden"
}
```

---

## ⚠️ Security Notes

1. **Change default passwords** before deploying to production
2. **Student exit request page** is intentionally public (students don't have accounts)
3. **Role enforcement** happens at both frontend (UX) and backend (security)
4. **JWT tokens** expire after 7 days (configurable in .env)

---

## 🐛 Troubleshooting

**"Failed to load analytics"**
- Check backend is running
- Check MongoDB connection
- Check browser console for specific error
- Now shows detailed error messages with retry button

**"Access Denied" on page**
- Your role doesn't have permission
- Check your role in user menu (bottom left)
- Contact admin to update your permissions

**Student exit request not working**
- Ensure student SAP ID exists in database
- Student must be marked as "hosteller" category
- Check if student has an assigned hostel/warden
