# How to Clear Test Data and Re-upload

## The Issue

You're seeing duplicate key errors because the students from `test-students-30.xlsx` already exist in the database from previous upload attempts.

**Error**: `E11000 duplicate key error... sapId_1 dup key: { sapId: "SAP001" }`

This is **expected behavior** - the system correctly prevents duplicate students!

## Solution Options

### Option 1: Delete Test Students (Recommended)

**Step 1: Delete test students**
```bash
cd backend
node delete-test-students.js
```

**Step 2: Upload again**
- Go to Student Management
- Click "Upload Excel"
- Select `test-students-30.xlsx`
- All 30 should upload successfully this time

### Option 2: Use MongoDB Compass/Shell

**Delete via MongoDB Compass:**
1. Connect to your database
2. Go to `smart_campus.students` collection
3. Filter: `{ sapId: { $regex: /^SAP0/ } }`
4. Delete matching documents

**Delete via MongoDB Shell:**
```bash
mongosh
use smart_campus
db.students.deleteMany({ sapId: { $regex: /^SAP0/ } })
```

### Option 3: Create New Test File

Create a new Excel file with different SAP IDs (e.g., TEST001-TEST030 instead of SAP001-SAP030).

## Expected Upload Flow

### First Upload (Fresh Database):
```
✅ Total Rows: 30
✅ Success Count: 30
✅ Failure Count: 0
```

### Second Upload (Same File):
```
⚠️ Total Rows: 30
❌ Success Count: 0
✅ Failure Count: 30
Errors: All showing "Duplicate sapId: SAPXXX"
```

This is **correct behavior** - it prevents duplicate student records!

## What Actually Happened

Looking at your upload attempts:

1. **First attempt**: Some students uploaded (probably hostellers)
2. **Second attempt**: Day scholars tried to upload but some already existed
3. **Now**: All 30 students exist in database, so all fail with duplicate errors

## Verification

After deleting and re-uploading, verify:

1. **Check student count**:
   - Go to Student Management
   - Should see 30 students total

2. **Filter by category**:
   - Day Scholars: 15 students
   - Hostellers: 15 students

3. **Try uploading again**:
   - Should get 30 duplicate errors (proving it works!)

## Quick Reference

**Delete test students**:
```bash
cd backend
node delete-test-students.js
```

**Check database**:
```javascript
// In MongoDB shell
db.students.countDocuments({ sapId: /^SAP0/ })
```

**Upload fresh**:
- Student Management → Upload Excel → test-students-30.xlsx

---

**Status**: Your upload feature is working perfectly! The duplicate error is the expected behavior for preventing duplicate records. 🎉
