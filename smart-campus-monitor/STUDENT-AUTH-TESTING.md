# Student Exit Request Authentication - Testing Guide

## 🔐 Authentication Details

### How It Works:
- **Username:** Student's Full Name (case-insensitive)
- **Password:** Student's Phone Number (as registered in database)
- **Access:** Only HOSTELLERS can login (day scholars are blocked)

---

## 📋 Test Credentials from Seed Data

### **Hosteller Students (Boys)**

1. **Rohan Gupta**
   - Name: `Rohan Gupta`
   - Phone: `9876543212`
   - SAP ID: 500091003
   - Hostel: Boys Hostel A - North Wing

2. **Aditya Verma**
   - Name: `Aditya Verma`
   - Phone: `9876543220`
   - SAP ID: 500091011
   - Hostel: Boys Hostel A - North Wing

3. **Rahul Mehta**
   - Name: `Rahul Mehta`
   - Phone: `9876543222`
   - SAP ID: 500091013
   - Hostel: Boys Hostel A - North Wing

### **Hosteller Students (Girls)**

4. **Sneha Reddy**
   - Name: `Sneha Reddy`
   - Phone: `9876543214`
   - SAP ID: 500091004
   - Hostel: Girls Hostel B - South Wing

5. **Priya Sharma**
   - Name: `Priya Sharma`
   - Phone: `9876543215`
   - SAP ID: 500091005
   - Hostel: Girls Hostel B - South Wing

6. **Kavya Rao**
   - Name: `Kavya Rao`
   - Phone: `9876543221`
   - SAP ID: 500091012
   - Hostel: Girls Hostel B - South Wing

7. **Neha Desai**
   - Name: `Neha Desai`
   - Phone: `9876543223`
   - SAP ID: 500091014
   - Hostel: Girls Hostel B - South Wing

---

## 🔧 Troubleshooting Steps

### Step 1: Verify Database Has Students
Run this in backend directory:
```bash
node utils/test-auth.js
```

This will show:
- All hostellers in database
- Their names and phone numbers
- Test authentication for Rohan Gupta

### Step 2: Reseed Database (if needed)
If no students exist or data is wrong:
```bash
npm run seed
```

### Step 3: Check Backend Logs
When you try to login, check the backend console for:
- "Student authentication error" messages
- MongoDB query results
- Phone number comparison details

### Step 4: Test API Directly
Use curl or Postman:

```bash
curl -X POST http://localhost:5000/api/hosteller/student/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"Rohan Gupta\",\"password\":\"9876543212\"}"
```

Expected response (success):
```json
{
  "success": true,
  "student": {
    "_id": "...",
    "name": "Rohan Gupta",
    "sapId": "500091003",
    "email": "rohan.gupta@college.edu",
    "phone": "9876543212",
    "roomNumber": "123",
    "hostel": {...}
  },
  "latestRequest": null
}
```

Expected response (failure):
```json
{
  "message": "Invalid credentials or not a hosteller"
}
```

---

## ⚠️ Common Issues & Fixes

### Issue 1: "Invalid credentials" with correct details

**Possible Causes:**
1. Database not seeded properly
2. Student's `studentType` is not set to `'hosteller'`
3. Student's `isActive` is false
4. Phone number has extra spaces/characters

**Fix:**
- Reseed the database: `npm run seed`
- Run test script: `node utils/test-auth.js`

### Issue 2: Day scholars trying to login

**Expected Behavior:**
- Day scholars should get "Invalid credentials or not a hosteller"
- This is correct - only hostellers can access

### Issue 3: Phone number mismatch

**Check:**
- Ensure phone number entered matches exactly
- No spaces, dashes, or parentheses
- Just digits: `9876543212`

### Issue 4: Name case sensitivity

**Note:**
- Name matching is case-INSENSITIVE
- `rohan gupta`, `Rohan Gupta`, `ROHAN GUPTA` all work
- But spelling must be exact

---

## 🧪 Manual Testing Checklist

- [ ] Backend running on port 5000
- [ ] Frontend running on port 5173
- [ ] Database seeded with students
- [ ] Navigate to `/student/exit-request`
- [ ] See login form
- [ ] Try: Name=`Rohan Gupta`, Phone=`9876543212`
- [ ] Should see student dashboard
- [ ] Try submitting exit request
- [ ] Try logout button
- [ ] Try day scholar login (should fail)

---

## 📞 Need Help?

If authentication still doesn't work:
1. Check backend console for error messages
2. Verify MongoDB is running
3. Confirm seed completed successfully
4. Run `node utils/test-auth.js` to debug
