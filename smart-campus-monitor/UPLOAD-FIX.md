# Upload Issue Fix - Course/Department Normalization

## Problem
When uploading `test-students-30.xlsx`, 16 students uploaded successfully but 14 failed.

## Root Cause
The `transformStudentData` function was not using the normalization utility functions (`normalizeCategory`, `normalizeCourse`, `normalizeDepartment`) before inserting data into MongoDB.

**Issue**: 
- Excel data had values like "Engineering" (capital E) or "Computer Science" (capital C)
- Schema validation expects lowercase normalized values: "engineering", "computer science"
- Without normalization, the pre-validate hook was rejecting records with case mismatches

## Fix Applied

### Before (Incorrect):
```javascript
const baseData = {
  course: row.course ? row.course.toString().trim() : null,
  department: row.department ? row.department.toString().trim() : null,
  category: category || null,
};
```

### After (Correct):
```javascript
const baseData = {
  course: row.course ? normalizeCourse(row.course) : null,
  department: row.department ? normalizeDepartment(row.department) : null,
  category: normalizeCategory(rawCategory),
  email: row.email ? row.email.toString().trim().toLowerCase() : null,
  parentEmail: row.parentEmail ? row.parentEmail.toString().trim().toLowerCase() : null,
};
```

## Changes Made

### 1. Updated `transformStudentData` function
**File**: `backend/controllers/studentController.js`

- ✅ Now uses `normalizeCategory()` for category field
- ✅ Now uses `normalizeCourse()` for course field  
- ✅ Now uses `normalizeDepartment()` for department field
- ✅ Converts emails to lowercase
- ✅ Uses normalized category for conditional logic

### 2. Improved Error Messages
- ✅ Better error messages for duplicate keys (sapId vs zktUserID)
- ✅ Clearer department validation errors showing course and department values

## How to Test the Fix

### Step 1: Restart Backend
```bash
cd backend
npm start
```

### Step 2: Re-upload Excel File
1. Login as admin
2. Go to Student Management
3. Click "Upload Excel"
4. Select `test-students-30.xlsx`
5. Click Upload

### Step 3: Expected Result
```
✅ Total Rows: 30
✅ Success Count: 30
✅ Failure Count: 0
✅ Errors: []
```

## Why This Happened

The Student schema uses **setter functions** for normalization:

```javascript
// Student schema
category: {
  type: String,
  enum: ['dayscholars', 'hostellers'],
  set: normalizeCategory,  // ← This normalizes on save
}
```

However, the **pre-validate hook** runs BEFORE setters, so it was checking:
- `department: "Computer Science"` (from Excel)
- Against: `['computer science', 'computer engineering']` (schema expects lowercase)
- Result: Validation failed!

The fix ensures data is normalized BEFORE creating the document, so validation passes.

## Validation Flow

**Old Flow (Broken)**:
1. Read Excel: `course="Engineering"`, `department="Computer Science"`
2. Create document with raw values
3. Pre-validate hook runs → FAILS (case mismatch)
4. Document rejected

**New Flow (Fixed)**:
1. Read Excel: `course="Engineering"`, `department="Computer Science"`
2. Normalize: `course="engineering"`, `department="computer science"`
3. Create document with normalized values
4. Pre-validate hook runs → PASSES ✓
5. Setters normalize again (idempotent)
6. Document saved successfully

## Prevention

For future uploads, ensure:
- Always use normalization functions from `utils/studentMeta.js`
- Apply normalization BEFORE validation
- Keep emails lowercase
- Test with various case combinations in Excel

## Files Modified

1. `backend/controllers/studentController.js` - transformStudentData function
2. Error handling improved for better debugging

## Verified

✅ Excel data validated - all 30 rows have correct course-department combinations  
✅ Normalization functions applied consistently  
✅ Error messages improved for better debugging

---

**Status**: Fixed and ready for testing
**Expected Outcome**: All 30 students should now upload successfully
