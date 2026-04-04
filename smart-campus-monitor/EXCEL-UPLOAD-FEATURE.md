# Excel Student Upload Feature

## Overview

This feature allows college administrators to bulk upload student data via Excel files (.xlsx/.xls). The system automatically validates, transforms, and stores student records in MongoDB with proper error handling.

## Features

✅ **File Upload**
- Accepts `.xlsx` and `.xls` files only
- Multer-based file handling with temporary storage
- Automatic file cleanup after processing

✅ **Data Validation**
- Required fields: sapId, name, email, category, course, department
- Category must be "dayscholars" or "hostellers"
- Department must match course (schema validation)
- Comprehensive error reporting with row numbers

✅ **Smart Transformation**
- Category-based auto-configuration:
  - **Hostellers**: `studentType='hosteller'`, `isHosteller=true`, `wardenApprovalRequired=true`
  - **Day Scholars**: `studentType='day_scholar'`, `isHosteller=false`, `wardenApprovalRequired=false`, `hostel=null`, `roomNumber=""`
- Empty cells converted to null/defaults (not string "NULL")

✅ **Robust Error Handling**
- Continues inserting valid rows even if some fail
- Returns detailed results:
  - Total rows processed
  - Success count
  - Failure count with reasons
- Handles duplicate sapId gracefully
- Validates department against course

✅ **User Experience**
- Download Excel template with sample data
- Real-time upload progress
- Error report download as CSV
- Visual summary with success/failure counts
- Detailed error table with row numbers

## Usage

### 1. Access the Feature
1. Login as admin
2. Navigate to **Student Management** page
3. Click **Upload Excel** button

### 2. Prepare Your Excel File

**Required Columns:**
- `sapId` - Unique student ID
- `name` - Student name
- `email` - Student email
- `category` - Must be "dayscholars" or "hostellers"
- `course` - pharmacy, engineering, mbatech, pharmatech
- `department` - Must match course

**Optional Columns:**
- `year` - Academic year (1-5)
- `phone` - Student phone
- `parentEmail` - Parent email
- `parentPhone` - Parent phone
- `address` - Student address
- `bloodGroup` - Blood group
- `hostel` - Hostel name (for hostellers)
- `roomNumber` - Room number (for hostellers)

**Valid Course-Department Combinations:**
- `pharmacy` → `bpharm`
- `engineering` → `computer science`, `computer engineering`
- `mbatech` → `mbatech`
- `pharmatech` → `pharmatech`

### 3. Upload Process
1. Click **"Download Template"** to get a sample Excel file
2. Fill in your student data (keep the header row)
3. Click **"Select Excel File"** and choose your file
4. Click **"Upload"** to process
5. Review the results:
   - Success/failure summary
   - Detailed error list (if any)
   - Download error report for failed rows

## Example Excel Data

| sapId | name | email | category | course | department | year | phone | bloodGroup |
|-------|------|-------|----------|--------|------------|------|-------|------------|
| SAP001 | John Doe | john@example.com | dayscholars | engineering | computer science | 2 | 9876543210 | O+ |
| SAP002 | Jane Smith | jane@example.com | hostellers | pharmacy | bpharm | 3 | 9876543212 | A+ |

## API Endpoint

```
POST /api/students/upload
Authorization: Bearer <admin-token>
Content-Type: multipart/form-data

Body: FormData with 'file' field
```

**Response:**
```json
{
  "message": "Upload processing completed",
  "results": {
    "totalRows": 10,
    "successCount": 8,
    "failureCount": 2,
    "errors": [
      {
        "row": 5,
        "error": "Missing required fields: email"
      },
      {
        "sapId": "SAP010",
        "name": "John Doe",
        "error": "Duplicate sapId: SAP010"
      }
    ]
  }
}
```

## Technical Details

### Backend Components
- **Controller**: `backend/controllers/studentController.js`
  - `uploadStudentsExcel()` - Handles upload, parsing, validation, transformation, insertion
  - `transformStudentData()` - Applies category-based rules
- **Route**: `POST /api/students/upload` (admin only)
- **Dependencies**: `multer`, `xlsx`
- **Storage**: `backend/uploads/` (temporary, auto-deleted)

### Frontend Components
- **Modal**: `frontend/src/components/ExcelUploadModal.jsx`
  - File selection with validation
  - Upload progress indicator
  - Results display with error table
  - Template and error report download
- **Integration**: `frontend/src/pages/StudentManagement.jsx`
  - Upload button in toolbar
  - Auto-refresh after successful upload
- **API**: `frontend/src/services/api.js`
  - `uploadStudentsExcelApi(formData)`

### Data Flow
1. Admin selects Excel file
2. Frontend validates file extension
3. FormData sent to `/api/students/upload`
4. Multer saves file to `uploads/`
5. xlsx parses first sheet to JSON
6. Each row validated and transformed
7. `Student.insertMany()` with `ordered:false`
8. Errors collected from writeErrors
9. File deleted from uploads/
10. Results returned to frontend
11. Frontend displays summary and errors

## Error Handling

### Common Errors
- **"Missing required fields"** - Fill in sapId, name, email, category, course, department
- **"Invalid category"** - Use "dayscholars" or "hostellers"
- **"Duplicate sapId"** - Student with this ID already exists
- **"Department must be one of..."** - Department doesn't match course
- **"Only .xlsx and .xls files allowed"** - Upload Excel file format

### Troubleshooting
1. Download error report CSV to see all failures
2. Fix errors in original Excel file
3. Re-upload (successful rows won't duplicate due to unique sapId)
4. Or manually add failed students via regular form

## Testing

A sample Excel file is available at:
`backend/sample-students.xlsx`

Test data includes:
- 1 day scholar (engineering)
- 1 hosteller (pharmacy)

## Security
- Admin authentication required (`protect`, `authorize('admin')`)
- File type validation (only .xlsx, .xls)
- Temporary file storage with auto-cleanup
- Audit logging of upload operations

## Future Enhancements
- ✨ Preview Excel data before uploading
- ✨ Progress bar for large files
- ✨ Duplicate detection warnings before insert
- ✨ Update existing students option
- ✨ Support for multiple sheets
- ✨ Field mapping UI for custom Excel formats
