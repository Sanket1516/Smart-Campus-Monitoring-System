# Smart Campus Entry Monitoring System - API Documentation

Base URL: `http://localhost:5000/api`

---

## Authentication

All protected endpoints require a JSON Web Token (JWT) in the `Authorization` header:

```
Authorization: Bearer <token>
```

---

## Error Response Format

All errors follow a consistent format:

```json
{
  "success": false,
  "error": "Human-readable error message"
}
```

Common HTTP status codes:

| Code | Meaning                |
|------|------------------------|
| 400  | Bad Request            |
| 401  | Unauthorized           |
| 403  | Forbidden              |
| 404  | Not Found              |
| 500  | Internal Server Error  |

---

## Endpoints

### Auth

#### POST /api/auth/login

Authenticate a user and receive a JWT.

**Request Body:**

```json
{
  "email": "admin@university.edu",
  "password": "password123"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "_id": "6623a1b2c3d4e5f6a7b8c9d0",
    "name": "Admin User",
    "email": "admin@university.edu",
    "role": "admin"
  }
}
```

**Error Response (401):**

```json
{
  "success": false,
  "error": "Invalid email or password"
}
```

---

#### GET /api/auth/me

Get the currently authenticated user's profile.

**Headers:**

```
Authorization: Bearer <token>
```

**Success Response (200):**

```json
{
  "success": true,
  "user": {
    "_id": "6623a1b2c3d4e5f6a7b8c9d0",
    "name": "Admin User",
    "email": "admin@university.edu",
    "role": "admin"
  }
}
```

**Error Response (401):**

```json
{
  "success": false,
  "error": "Not authorized, token missing or invalid"
}
```

---

#### POST /api/auth/register (Admin Only)

Register a new security guard or admin user. Only accessible by users with the `admin` role.

**Headers:**

```
Authorization: Bearer <token>
```

**Request Body:**

```json
{
  "name": "Security Guard",
  "email": "guard@university.edu",
  "password": "securePass456",
  "role": "guard"
}
```

**Success Response (201):**

```json
{
  "success": true,
  "user": {
    "_id": "6623b2c3d4e5f6a7b8c9d0e1",
    "name": "Security Guard",
    "email": "guard@university.edu",
    "role": "guard"
  }
}
```

**Error Response (403):**

```json
{
  "success": false,
  "error": "Not authorized. Admin access required"
}
```

**Error Response (400):**

```json
{
  "success": false,
  "error": "User with this email already exists"
}
```

---

### Scan

#### POST /api/scan

Record a student entry scan at a campus gate. If the SAP ID is not found in the student database, an unauthorized entry log is created.

**Headers:**

```
Authorization: Bearer <token>
```

**Request Body:**

```json
{
  "sapId": "60004230045",
  "gate": "Main Gate"
}
```

**Success Response (200) - Authorized Student:**

```json
{
  "success": true,
  "authorized": true,
  "entry": {
    "_id": "6623c3d4e5f6a7b8c9d0e1f2",
    "student": {
      "sapId": "60004230045",
      "name": "John Doe",
      "department": "Computer Science",
      "year": 3,
      "isHosteller": true
    },
    "gate": "Main Gate",
    "timestamp": "2026-03-16T08:30:00.000Z",
    "scannedBy": "6623a1b2c3d4e5f6a7b8c9d0"
  }
}
```

**Success Response (200) - Unauthorized Entry:**

```json
{
  "success": true,
  "authorized": false,
  "entry": {
    "_id": "6623d4e5f6a7b8c9d0e1f2a3",
    "sapId": "UNKNOWN_ID_123",
    "gate": "Main Gate",
    "timestamp": "2026-03-16T08:32:00.000Z",
    "resolved": false,
    "scannedBy": "6623a1b2c3d4e5f6a7b8c9d0"
  }
}
```

**Error Response (400):**

```json
{
  "success": false,
  "error": "sapId and gate are required"
}
```

---

### Students

#### GET /api/students

Retrieve a list of all students. Supports query filters.

**Headers:**

```
Authorization: Bearer <token>
```

**Query Parameters:**

| Parameter    | Type    | Description                          |
|--------------|---------|--------------------------------------|
| department   | string  | Filter by department name            |
| year         | number  | Filter by year (1-4)                 |
| isHosteller  | boolean | Filter hostellers (`true` / `false`) |
| search       | string  | Search by name or SAP ID             |
| page         | number  | Page number (default: 1)             |
| limit        | number  | Results per page (default: 20)       |

**Success Response (200):**

```json
{
  "success": true,
  "count": 2,
  "total": 150,
  "page": 1,
  "pages": 8,
  "students": [
    {
      "_id": "6623e5f6a7b8c9d0e1f2a3b4",
      "sapId": "60004230045",
      "name": "John Doe",
      "email": "john.doe@university.edu",
      "department": "Computer Science",
      "year": 3,
      "isHosteller": true,
      "createdAt": "2026-01-15T10:00:00.000Z"
    },
    {
      "_id": "6623f6a7b8c9d0e1f2a3b4c5",
      "sapId": "60004230098",
      "name": "Jane Smith",
      "email": "jane.smith@university.edu",
      "department": "Electronics",
      "year": 2,
      "isHosteller": false,
      "createdAt": "2026-01-16T11:00:00.000Z"
    }
  ]
}
```

---

#### GET /api/students/:sapId

Retrieve a single student by SAP ID.

**Headers:**

```
Authorization: Bearer <token>
```

**Success Response (200):**

```json
{
  "success": true,
  "student": {
    "_id": "6623e5f6a7b8c9d0e1f2a3b4",
    "sapId": "60004230045",
    "name": "John Doe",
    "email": "john.doe@university.edu",
    "department": "Computer Science",
    "year": 3,
    "isHosteller": true,
    "createdAt": "2026-01-15T10:00:00.000Z"
  }
}
```

**Error Response (404):**

```json
{
  "success": false,
  "error": "Student not found with SAP ID: 60004230045"
}
```

---

#### POST /api/students

Create a new student record.

**Headers:**

```
Authorization: Bearer <token>
```

**Request Body:**

```json
{
  "sapId": "60004230120",
  "name": "Alice Johnson",
  "email": "alice.johnson@university.edu",
  "department": "Mechanical Engineering",
  "year": 1,
  "isHosteller": true
}
```

**Success Response (201):**

```json
{
  "success": true,
  "student": {
    "_id": "6624a7b8c9d0e1f2a3b4c5d6",
    "sapId": "60004230120",
    "name": "Alice Johnson",
    "email": "alice.johnson@university.edu",
    "department": "Mechanical Engineering",
    "year": 1,
    "isHosteller": true,
    "createdAt": "2026-03-16T09:00:00.000Z"
  }
}
```

**Error Response (400):**

```json
{
  "success": false,
  "error": "Student with SAP ID 60004230120 already exists"
}
```

---

#### PUT /api/students/:sapId

Update an existing student record.

**Headers:**

```
Authorization: Bearer <token>
```

**Request Body (partial update supported):**

```json
{
  "department": "Information Technology",
  "year": 2,
  "isHosteller": false
}
```

**Success Response (200):**

```json
{
  "success": true,
  "student": {
    "_id": "6623e5f6a7b8c9d0e1f2a3b4",
    "sapId": "60004230045",
    "name": "John Doe",
    "email": "john.doe@university.edu",
    "department": "Information Technology",
    "year": 2,
    "isHosteller": false,
    "createdAt": "2026-01-15T10:00:00.000Z"
  }
}
```

**Error Response (404):**

```json
{
  "success": false,
  "error": "Student not found with SAP ID: 60004230045"
}
```

---

#### DELETE /api/students/:sapId

Delete a student record.

**Headers:**

```
Authorization: Bearer <token>
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Student with SAP ID 60004230045 deleted successfully"
}
```

**Error Response (404):**

```json
{
  "success": false,
  "error": "Student not found with SAP ID: 60004230045"
}
```

---

### Logs

#### GET /api/logs

Retrieve entry scan logs. Supports filtering and pagination.

**Headers:**

```
Authorization: Bearer <token>
```

**Query Parameters:**

| Parameter | Type   | Description                                  |
|-----------|--------|----------------------------------------------|
| gate      | string | Filter by gate name                          |
| startDate | string | Start date in ISO 8601 format                |
| endDate   | string | End date in ISO 8601 format                  |
| sapId     | string | Filter by student SAP ID                     |
| page      | number | Page number (default: 1)                     |
| limit     | number | Results per page (default: 50)               |

**Success Response (200):**

```json
{
  "success": true,
  "count": 2,
  "total": 320,
  "page": 1,
  "pages": 7,
  "logs": [
    {
      "_id": "6623c3d4e5f6a7b8c9d0e1f2",
      "student": {
        "sapId": "60004230045",
        "name": "John Doe",
        "department": "Computer Science"
      },
      "gate": "Main Gate",
      "timestamp": "2026-03-16T08:30:00.000Z",
      "scannedBy": {
        "name": "Security Guard",
        "email": "guard@university.edu"
      }
    },
    {
      "_id": "6623c4d5e6f7a8b9c0d1e2f3",
      "student": {
        "sapId": "60004230098",
        "name": "Jane Smith",
        "department": "Electronics"
      },
      "gate": "South Gate",
      "timestamp": "2026-03-16T08:45:00.000Z",
      "scannedBy": {
        "name": "Security Guard",
        "email": "guard@university.edu"
      }
    }
  ]
}
```

---

#### GET /api/logs/unauthorized

Retrieve all unauthorized entry attempts.

**Headers:**

```
Authorization: Bearer <token>
```

**Query Parameters:**

| Parameter | Type    | Description                                  |
|-----------|---------|----------------------------------------------|
| resolved  | boolean | Filter by resolved status                    |
| gate      | string  | Filter by gate name                          |
| startDate | string  | Start date in ISO 8601 format                |
| endDate   | string  | End date in ISO 8601 format                  |
| page      | number  | Page number (default: 1)                     |
| limit     | number  | Results per page (default: 50)               |

**Success Response (200):**

```json
{
  "success": true,
  "count": 1,
  "total": 12,
  "page": 1,
  "pages": 1,
  "logs": [
    {
      "_id": "6623d4e5f6a7b8c9d0e1f2a3",
      "sapId": "UNKNOWN_ID_123",
      "gate": "Main Gate",
      "timestamp": "2026-03-16T08:32:00.000Z",
      "resolved": false,
      "resolvedBy": null,
      "resolvedAt": null,
      "notes": null,
      "scannedBy": {
        "name": "Security Guard",
        "email": "guard@university.edu"
      }
    }
  ]
}
```

---

#### PUT /api/logs/unauthorized/:id/resolve

Mark an unauthorized entry as resolved.

**Headers:**

```
Authorization: Bearer <token>
```

**Request Body:**

```json
{
  "notes": "Verified as a visitor with valid gate pass. Issue resolved."
}
```

**Success Response (200):**

```json
{
  "success": true,
  "log": {
    "_id": "6623d4e5f6a7b8c9d0e1f2a3",
    "sapId": "UNKNOWN_ID_123",
    "gate": "Main Gate",
    "timestamp": "2026-03-16T08:32:00.000Z",
    "resolved": true,
    "resolvedBy": {
      "name": "Admin User",
      "email": "admin@university.edu"
    },
    "resolvedAt": "2026-03-16T10:00:00.000Z",
    "notes": "Verified as a visitor with valid gate pass. Issue resolved."
  }
}
```

**Error Response (404):**

```json
{
  "success": false,
  "error": "Unauthorized entry log not found"
}
```

---

### Dashboard

#### GET /api/dashboard

Get summary statistics for the dashboard.

**Headers:**

```
Authorization: Bearer <token>
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "totalStudents": 1500,
    "totalEntriesToday": 487,
    "unauthorizedToday": 3,
    "unresolvedCount": 5,
    "topGates": [
      { "gate": "Main Gate", "count": 245 },
      { "gate": "South Gate", "count": 132 },
      { "gate": "Library Gate", "count": 110 }
    ],
    "recentEntries": [
      {
        "sapId": "60004230045",
        "name": "John Doe",
        "gate": "Main Gate",
        "timestamp": "2026-03-16T08:30:00.000Z"
      }
    ]
  }
}
```

---

#### GET /api/dashboard/hourly

Get hourly entry distribution for charts.

**Headers:**

```
Authorization: Bearer <token>
```

**Query Parameters:**

| Parameter | Type   | Description                                   |
|-----------|--------|-----------------------------------------------|
| date      | string | Date in YYYY-MM-DD format (default: today)    |
| gate      | string | Filter by gate name (default: all gates)      |

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "date": "2026-03-16",
    "hourly": [
      { "hour": 7, "count": 12 },
      { "hour": 8, "count": 85 },
      { "hour": 9, "count": 120 },
      { "hour": 10, "count": 67 },
      { "hour": 11, "count": 45 },
      { "hour": 12, "count": 30 },
      { "hour": 13, "count": 55 },
      { "hour": 14, "count": 40 },
      { "hour": 15, "count": 20 },
      { "hour": 16, "count": 10 },
      { "hour": 17, "count": 3 }
    ]
  }
}
```

---

#### GET /api/dashboard/hostellers

Get hosteller-specific entry statistics.

**Headers:**

```
Authorization: Bearer <token>
```

**Query Parameters:**

| Parameter | Type   | Description                                   |
|-----------|--------|-----------------------------------------------|
| startDate | string | Start date in ISO 8601 format                |
| endDate   | string | End date in ISO 8601 format                  |

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "totalHostellers": 620,
    "checkedInToday": 412,
    "lateEntries": 15,
    "departmentBreakdown": [
      { "department": "Computer Science", "total": 180, "checkedIn": 120 },
      { "department": "Electronics", "total": 150, "checkedIn": 98 },
      { "department": "Mechanical Engineering", "total": 140, "checkedIn": 102 },
      { "department": "Civil Engineering", "total": 150, "checkedIn": 92 }
    ]
  }
}
```

---

### Notifications

#### POST /api/notify

Send a notification alert (e.g., for unauthorized entry or late hosteller return).

**Headers:**

```
Authorization: Bearer <token>
```

**Request Body:**

```json
{
  "type": "unauthorized_entry",
  "title": "Unauthorized Entry Detected",
  "message": "An unregistered ID was scanned at Main Gate at 08:32 AM.",
  "recipients": ["admin@university.edu", "security@university.edu"],
  "priority": "high"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "notification": {
    "_id": "6624b8c9d0e1f2a3b4c5d6e7",
    "type": "unauthorized_entry",
    "title": "Unauthorized Entry Detected",
    "message": "An unregistered ID was scanned at Main Gate at 08:32 AM.",
    "recipients": ["admin@university.edu", "security@university.edu"],
    "priority": "high",
    "sentAt": "2026-03-16T08:33:00.000Z",
    "status": "sent"
  }
}
```

**Error Response (400):**

```json
{
  "success": false,
  "error": "type, title, message, and recipients are required"
}
```

---

## Rate Limiting

API requests are rate-limited to **100 requests per minute** per IP address. Exceeding this limit returns:

```json
{
  "success": false,
  "error": "Too many requests. Please try again later."
}
```

Response headers include:

| Header                  | Description                  |
|-------------------------|------------------------------|
| X-RateLimit-Limit       | Max requests per window      |
| X-RateLimit-Remaining   | Remaining requests           |
| X-RateLimit-Reset       | Time until window resets (s) |
