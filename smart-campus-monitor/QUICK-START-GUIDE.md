# 🎓 Smart Campus Monitor - Complete Guide

## 📋 Table of Contents
1. [Login Credentials](#login-credentials)
2. [Student Exit Request Page](#student-exit-request-page)
3. [Role-Based Access Overview](#role-based-access-overview)
4. [Testing Guide](#testing-guide)

---

## 🔑 Login Credentials

### All User Accounts (After Running Seed)

| Role | Username | Password | Access Level |
|------|----------|----------|--------------|
| **Admin** | `admin` | `admin123` | Full system access |
| **Warden** | `warden1` | `warden123` | Hostel management & approvals |
| **Security** | `security1` | `security123` | Gate scanning & viewing logs |

### How to Create Accounts

**Step 1: Run the seed script**
```bash
cd backend
npm run seed
```

This will create all three accounts automatically!

**Output:**
```
Seed completed successfully!
  Students: 11
  Admins: 3
  Entry logs: ~60
  Unauthorized logs: 2

Default credentials:
  Admin:    admin / admin123
  Warden:   warden1 / warden123
  Security: security1 / security123
```

---

## 📝 Student Exit Request Page

### 📍 Location
**URL:** `http://localhost:5173/student/exit-request`

### ✨ Features
- ✅ **No login required** - Students access directly
- ✅ **SAP ID lookup** - Verify student identity
- ✅ **Request submission** - Exit time, return time, reason
- ✅ **Status tracking** - Check approval status
- ✅ **Hosteller-only** - Only hostel students can request exits

### 🎯 How It Works

#### For Students:
1. Visit `/student/exit-request`
2. Enter SAP ID (e.g., `500091003`)
3. System shows student profile if found
4. Fill out the exit request form:
   - **Reason**: Medical, Family Visit, Personal Work, Emergency, Other
   - **Reason Details**: Brief explanation
   - **Exit Time**: When you want to leave
   - **Return Time**: When you'll be back
5. Submit request
6. Check status later using same SAP ID

#### For Wardens:
1. Login as warden (`warden1` / `warden123`)
2. Navigate to **Warden Portal**
3. See all pending exit requests
4. Click **Approve** or **Reject**
5. Add notes (optional)
6. Student sees updated status

### 🧪 Test Student SAP IDs

**Hostellers (Can request exits):**
- `500091003` - Rohan Gupta (Computer Engineering, Year 2)
- `500091004` - Sneha Reddy (Pharmatech, Year 4)
- `500091006` - Ananya Iyer (Pharmacy, Year 1)
- `500091008` - Meera Joshi (Computer Science, Year 2)

**Day Scholars (Cannot request exits):**
- `500091001` - Aarav Sharma
- `500091002` - Priya Patel
- `500091005` - Vikram Singh

### 📸 Student Exit Request Workflow

```
┌─────────────────┐
│  Student enters │
│     SAP ID      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   System looks  │
│   up student    │
└────────┬────────┘
         │
    ┌────┴─────┐
    │ Found?   │
    └────┬─────┘
         │
    Yes  │  No → Show error
         │
         ▼
┌─────────────────┐
│  Show profile   │
│  & exit form    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Student fills   │
│  exit details   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Submit request  │
│  to warden      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Warden reviews  │
│  in portal      │
└────────┬────────┘
         │
    ┌────┴──────┐
    │ Approve?  │
    └────┬──────┘
         │
    Yes  │  No
         │   │
         │   └──→ Rejected
         │
         ▼
     Approved
```

---

## 🎭 Role-Based Access Overview

### Admin (`admin` / `admin123`)
**Full System Control**

✅ **Can Access:**
- Dashboard - System overview
- Scanner - Gate scanning interface
- Logs - Entry/exit logs
- Analytics - Charts and statistics
- Hostellers - Hostel student management
- Enrollment - Add/edit students
- Access Control - Block/unblock students
- Warden Portal - View all exit requests
- Terminals - Manage scanning terminals
- Settings - System configuration

✅ **Can Do:**
- Enroll new students
- Block/unblock students
- Approve/reject exit requests
- Create staff accounts
- Manage hostels and wardens
- View all analytics
- Configure system settings

---

### Warden (`warden1` / `warden123`)
**Hostel Management**

✅ **Can Access:**
- Dashboard - System overview
- Logs - Entry/exit logs
- Analytics - Charts and statistics
- Hostellers - Hostel student management
- Warden Portal - Exit request approvals

✅ **Can Do:**
- Approve/reject exit requests for their hostel
- View hostel student information
- Monitor late returns
- Track hostel entry/exit patterns
- View analytics for hostel students

❌ **Cannot Access:**
- Scanner (gate scanning)
- Enrollment (adding students)
- Access Control (blocking students)
- Terminals (terminal management)
- Settings (system config)

---

### Security (`security1` / `security123`)
**Gate Operations (View-Only)**

✅ **Can Access:**
- Dashboard - System overview
- Scanner - Gate scanning interface
- Logs - Entry/exit logs (view only)

✅ **Can Do:**
- Scan student ID cards at gate
- View entry/exit logs
- See current campus status
- View who's inside/outside

❌ **Cannot Access:**
- Analytics (statistics)
- Hostellers (hostel management)
- Enrollment (student management)
- Access Control (blocking)
- Warden Portal (approvals)
- Terminals (terminal management)
- Settings (system config)

---

## 🧪 Testing Guide

### Test 1: Admin Full Access
```bash
1. Login: admin / admin123
2. Verify: See ALL 10 menu items
3. Test: Navigate to each page → All load successfully
4. Test: Try blocking a student in Access Control
5. Test: View analytics charts
```

### Test 2: Warden Exit Request Flow
```bash
# As Student (no login):
1. Go to /student/exit-request
2. Enter SAP ID: 500091003
3. Fill form:
   - Reason: Medical
   - Details: "Doctor appointment"
   - Exit: Today 2:00 PM
   - Return: Today 6:00 PM
4. Submit request
5. Note: "Request submitted successfully"

# As Warden:
6. Login: warden1 / warden123
7. Go to Warden Portal
8. See: Rohan Gupta's exit request
9. Click: Approve button
10. Add note: "Approved for medical reasons"
11. Save

# Verify:
12. Go back to /student/exit-request
13. Enter SAP ID: 500091003
14. See: Request status = "Approved"
```

### Test 3: Security Limited Access
```bash
1. Login: security1 / security123
2. Verify: Only see 3 menu items (Dashboard, Scanner, Logs)
3. Try: Navigate to /analytics directly
4. See: "Access Denied" page with role display
5. Test: Scanner works for gate operations
```

### Test 4: Role-Based Menu Filtering
```bash
# Admin sees:
Dashboard, Scanner, Logs, Analytics, Hostellers, 
Enrollment, Access Control, Warden Portal, 
Terminals, Settings (10 items)

# Warden sees:
Dashboard, Logs, Analytics, Hostellers, 
Warden Portal (5 items)

# Security sees:
Dashboard, Scanner, Logs (3 items)
```

### Test 5: Analytics Error Handling
```bash
1. Login as any user with analytics access
2. Stop the backend server
3. Go to Analytics page
4. See: Detailed error message "Network error"
5. Click: Retry button
6. Start backend
7. Should load successfully
```

---

## 🚀 Quick Start Checklist

- [ ] MongoDB running
- [ ] Backend dependencies installed (`cd backend && npm install`)
- [ ] Frontend dependencies installed (`cd frontend && npm install`)
- [ ] Database seeded (`cd backend && npm run seed`)
- [ ] Backend running (`cd backend && npm run dev`)
- [ ] Frontend running (`cd frontend && npm run dev`)
- [ ] Test admin login (admin/admin123)
- [ ] Test warden login (warden1/warden123)
- [ ] Test security login (security1/security123)
- [ ] Test student exit request (no login)

---

## 📞 Common Issues

### "Invalid credentials"
- **Solution:** Run `npm run seed` again to reset accounts

### "Failed to load analytics"
- **Solution:** Check backend is running and MongoDB is connected
- Now shows detailed error with retry button!

### "Access Denied" on page
- **Cause:** Your role doesn't have permission
- **Solution:** Check your role in bottom-left user info
- **Expected:** Different roles see different pages

### Student exit request "Student not found"
- **Cause:** SAP ID not in database or student is day scholar
- **Solution:** Use hosteller SAP IDs listed above
- Run `npm run seed` to reset database

---

## 🎯 Key Improvements Made

✅ **Analytics Error Handling**
- Detailed error messages (auth, network, server)
- Retry and reset buttons
- Technical details for debugging

✅ **Role-Based Access Control**
- Menu items filtered by role
- Route-level protection
- Beautiful "Access Denied" pages
- Frontend matches backend permissions

✅ **Warden Account Added**
- New default account in seed script
- Full warden portal functionality
- Exit request approval workflow

✅ **Documentation**
- Complete credentials guide
- Testing instructions
- Role comparison tables
- Student exit request tutorial

---

## 📖 Additional Resources

- **Full README:** See `README.md` for technical details
- **Credentials:** See `CREDENTIALS.md` for login info
- **API Docs:** Backend routes documented in code
- **Frontend Routes:** See `App.jsx` for all routes

---

**Made with ❤️ for Smart Campus Monitoring**
