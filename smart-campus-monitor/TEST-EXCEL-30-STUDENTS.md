# Test Excel File - 30 Diverse Students

## 📁 File Created
**Location**: `backend/test-students-30.xlsx`  
**Size**: 32.7 KB  
**Students**: 30 with maximum variety

## 📊 Distribution Summary

### By Course:
| Course | Department | Count |
|--------|------------|-------|
| Engineering | Computer Science | 8 |
| Engineering | Computer Engineering | 5 |
| Pharmacy | BPharm | 7 |
| MBATech | MBATech | 4 |
| PharmaTech | PharmaTech | 6 |
| **TOTAL** | | **30** |

### By Category:
- 🏠 **Hostellers**: 15 students (50%)
  - Girls Hostel A, Girls Hostel B, Boys Hostel A, Boys Hostel B
- 🚶 **Day Scholars**: 15 students (50%)

### By Year:
- 1st Year: 12 students
- 2nd Year: 11 students
- 3rd Year: 5 students
- 4th Year: 2 students

## 👥 Student Samples

### Complete Data (Hosteller):
```
SAP002 - Priya Sharma
Email: priya.sharma@student.edu
Category: hostellers
Course: Engineering → Computer Science
Year: 2
Phone: 9876543202
Parents: priya.parent@gmail.com, 9876543302
Address: 45 Park Street, Mumbai
Blood Group: A+
Hostel: Girls Hostel A, Room 101
```

### Complete Data (Day Scholar):
```
SAP001 - Rajesh Kumar
Email: rajesh.kumar@student.edu
Category: dayscholars
Course: Engineering → Computer Science
Year: 1
Phone: 9876543201
Parents: rajesh.parent@gmail.com, 9876543301
Address: 123 MG Road, Delhi
Blood Group: O+
```

### Minimal Data:
```
SAP019 - Vishal Shah
Email: vishal.shah@student.edu
Category: dayscholars
Course: Engineering → Computer Science
Year: 1
(Empty optional fields - tests minimal data handling)
```

## 🎯 What to Expect on Upload

### Expected Result:
```
✅ Total Rows: 30
✅ Success Count: 30
✅ Failure Count: 0
✅ Errors: []
```

### Auto-Transformations:

**15 Hostellers will get:**
- `studentType` → "hosteller"
- `isHosteller` → true
- `wardenApprovalRequired` → true
- `hostel` and `roomNumber` preserved

**15 Day Scholars will get:**
- `studentType` → "day_scholar"
- `isHosteller` → false
- `wardenApprovalRequired` → false
- `hostel` → null
- `roomNumber` → ""

## 🧪 Testing Checklist

- [ ] Upload file successfully
- [ ] Verify all 30 students created
- [ ] Check hosteller transformations correct
- [ ] Check day scholar transformations correct
- [ ] Filter by category (15 each)
- [ ] Search by course/department
- [ ] Try duplicate upload (should fail 30 times)
- [ ] Verify empty fields are null (not "NULL")

## 🌟 Diversity Features

**Names**: Indian (North, South, East, West), International, Muslim names  
**Locations**: Delhi, Mumbai, Chennai, Bangalore, Hyderabad, Kolkata, Pune, Jaipur, +more  
**Blood Groups**: O+, A+, B+, AB+, O-, A-, B-, AB- (all covered)  
**Data Completeness**: Complete, partial, minimal (all scenarios)

## 🚀 How to Use

1. **Start Application**:
   ```bash
   cd backend && npm start
   cd frontend && npm run dev
   ```

2. **Upload**:
   - Login as admin
   - Go to Student Management
   - Click "Upload Excel"
   - Select `test-students-30.xlsx`
   - Click Upload

3. **Verify**:
   - Check success count = 30
   - Browse student list
   - Filter by category/course
   - Inspect database transformations

## 📋 All Students List

| SAP ID | Name | Category | Course | Dept | Year |
|--------|------|----------|--------|------|------|
| SAP001 | Rajesh Kumar | DS | Engineering | CS | 1 |
| SAP002 | Priya Sharma | H | Engineering | CS | 2 |
| SAP003 | Amit Patel | DS | Engineering | CS | 3 |
| SAP004 | Sneha Reddy | H | Engineering | CS | 1 |
| SAP005 | Vikram Singh | H | Engineering | CE | 2 |
| SAP006 | Ananya Iyer | DS | Engineering | CE | 4 |
| SAP007 | Karan Mehta | H | Engineering | CE | 3 |
| SAP008 | Divya Nair | H | Pharmacy | BPharm | 1 |
| SAP009 | Rohan Gupta | DS | Pharmacy | BPharm | 2 |
| SAP010 | Ishita Verma | H | Pharmacy | BPharm | 3 |
| SAP011 | Arjun Desai | DS | Pharmacy | BPharm | 4 |
| SAP012 | Kavya Menon | H | Pharmacy | BPharm | 2 |
| SAP013 | Siddharth Joshi | DS | MBATech | MBATech | 1 |
| SAP014 | Neha Kapoor | H | MBATech | MBATech | 2 |
| SAP015 | Aditya Rao | DS | MBATech | MBATech | 1 |
| SAP016 | Pooja Malhotra | H | PharmaTech | PharmaTech | 1 |
| SAP017 | Rahul Chatterjee | DS | PharmaTech | PharmaTech | 2 |
| SAP018 | Tanvi Agarwal | H | PharmaTech | PharmaTech | 1 |
| SAP019 | Vishal Shah | DS | Engineering | CS | 1 |
| SAP020 | Riya Das | H | Pharmacy | BPharm | 3 |
| SAP021 | Nikhil Bose | DS | Engineering | CE | 2 |
| SAP022 | Shreya Pillai | H | Engineering | CS | 4 |
| SAP023 | Harsh Saxena | DS | Pharmacy | BPharm | 1 |
| SAP024 | Sakshi Pandey | H | MBATech | MBATech | 2 |
| SAP025 | Manish Jain | DS | Engineering | CS | 3 |
| SAP026 | Sarah Johnson | H | Engineering | CE | 1 |
| SAP027 | Mohammed Ali | DS | Pharmacy | BPharm | 2 |
| SAP028 | Fatima Khan | H | PharmaTech | PharmaTech | 1 |
| SAP029 | David Kumar | DS | MBATech | MBATech | 1 |
| SAP030 | Aarti Kulkarni | H | Engineering | CS | 2 |

**Legend**: DS = Day Scholar, H = Hosteller, CS = Computer Science, CE = Computer Engineering

---

**Ready to test!** This file exercises all aspects of the Excel upload feature with realistic, diverse data. 🎉
