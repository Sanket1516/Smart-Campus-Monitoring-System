# Excel Upload Feature - Quick Start

## ✅ Installation Complete

All dependencies installed and feature is ready to use!

## 🚀 Quick Start

### 1. Start the Backend
```bash
cd backend
npm start
```

### 2. Start the Frontend
```bash
cd frontend
npm run dev
```

### 3. Test the Feature

1. **Login as Admin**
   - Navigate to http://localhost:5173/login
   - Use admin credentials

2. **Go to Student Management**
   - Click "Student Management" in sidebar
   - Click **"Upload Excel"** button (green button)

3. **Download Template**
   - Click "Download Template" in the modal
   - Open the CSV file in Excel
   - Save as `.xlsx` format

4. **Upload Students**
   - Fill in student data (see example below)
   - Click "Select Excel File"
   - Click "Upload"
   - View results and download error report if needed

## 📋 Sample Excel Data

Use the provided `backend/sample-students.xlsx` file or create your own:

### Day Scholar Example:
| sapId | name | email | category | course | department | year | phone | bloodGroup |
|-------|------|-------|----------|--------|------------|------|-------|------------|
| SAP001 | John Doe | john@test.com | dayscholars | engineering | computer science | 2 | 9876543210 | O+ |

### Hosteller Example:
| sapId | name | email | category | course | department | year | phone | bloodGroup | hostel | roomNumber |
|-------|------|-------|----------|--------|------------|------|-------|------------|--------|------------|
| SAP002 | Jane Smith | jane@test.com | hostellers | pharmacy | bpharm | 3 | 9876543212 | A+ | Girls Hostel | 201 |

## 🔑 Required Fields

- `sapId` (unique)
- `name`
- `email`
- `category` (dayscholars or hostellers)
- `course` (pharmacy, engineering, mbatech, pharmatech)
- `department` (must match course)

## ✨ Auto-Transformation Rules

**For Hostellers (category = "hostellers"):**
- ✅ studentType → "hosteller"
- ✅ isHosteller → true
- ✅ wardenApprovalRequired → true

**For Day Scholars (category = "dayscholars"):**
- ✅ studentType → "day_scholar"
- ✅ isHosteller → false
- ✅ wardenApprovalRequired → false
- ✅ hostel → null
- ✅ roomNumber → ""

## 📊 What You'll See

After upload, you get:
- ✅ Total rows processed
- ✅ Success count (green)
- ✅ Failure count (red)
- ✅ Detailed error list with row numbers
- ✅ Download error report as CSV

## 🔧 Troubleshooting

### "No file uploaded"
- Make sure you selected a file before clicking Upload

### "Only .xlsx and .xls files allowed"
- Save your CSV as Excel format (.xlsx)

### "Missing required fields"
- Check all required columns are filled in the Excel

### "Duplicate sapId"
- Student with this SAP ID already exists
- Use a different sapId or update the existing student manually

### "Department must be one of..."
- Make sure department matches the course:
  - pharmacy → bpharm
  - engineering → computer science, computer engineering
  - mbatech → mbatech
  - pharmatech → pharmatech

## 📁 Files Created/Modified

### Backend:
- ✅ `controllers/studentController.js` - Upload logic added
- ✅ `routes/students.js` - Upload route added
- ✅ `uploads/` folder - Created for temp storage
- ✅ `sample-students.xlsx` - Test file

### Frontend:
- ✅ `components/ExcelUploadModal.jsx` - Upload UI component
- ✅ `pages/StudentManagement.jsx` - Upload button integrated
- ✅ `services/api.js` - Upload API function added

### Documentation:
- ✅ `EXCEL-UPLOAD-FEATURE.md` - Complete feature documentation
- ✅ `.gitignore` - Updated to exclude uploads folder

## 🎯 Next Steps

1. Test with sample file: `backend/sample-students.xlsx`
2. Create your own Excel with actual student data
3. Upload and verify students are created in database
4. Check the auto-transformation for hostellers vs day scholars
5. Try intentional errors to see error reporting

## 💡 Pro Tips

- Download the template first to get the correct format
- Keep a backup of your Excel file
- Use error report CSV to fix issues quickly
- Upload in smaller batches for easier debugging
- sapId must be unique across all students

---

**Need help?** Check `EXCEL-UPLOAD-FEATURE.md` for detailed documentation.
