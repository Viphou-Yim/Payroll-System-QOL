# Payroll System — Desktop Application

A modern, installable payroll management system built with Electron, Express, MongoDB, and Angular.

## Quick Links
- **For Clients:** See [INSTALLATION.md](INSTALLATION.md) for installation and usage instructions
- **For Developers:** See sections below
- **Backend Docs:** [back/README.md](back/README.md)
- **Frontend Docs:** [front/README.md](front/README.md)

---

## Developer Setup

### Prerequisites
- Node.js 16+
- MongoDB running locally (`mongod` service on port 27017)
- Ports 3000 and 4000 available

### Installation

```bash
# Install all dependencies
npm install
npm --prefix back install
npm --prefix front install
```

### Development Mode

**Option 1: Run all services together (Recommended)**
```bash
npm run desktop:dev
```

This starts:
- Backend (Express) on port 4000
- Frontend (Angular dev server) on port 3000
- Electron desktop window (opens automatically)

**Option 2: Run services separately (for debugging)**

Terminal 1 - Backend:
```bash
npm --prefix back run dev
```

Terminal 2 - Frontend:
```bash
npm --prefix front run start
```

Terminal 3 - Electron:
```bash
npx electron .
```

### Building for Windows

Create an NSIS installer (.exe):

```bash
npm run desktop:build
```

Output: `dist/Payroll-System-*.exe`

**Note:** Building requires a Windows machine or Windows build tools installed.

---

## User Guide — Payroll Staff

### Starting the Application

**After installation:**
1. Find "Payroll System" in your Start Menu or desktop
2. Click to launch (first startup takes 15-30 seconds)

### Key Features

#### 1. Employee Management
- **People → Add Employee** - Create new employee records
- Set base salary, start date, and payroll group
- Manage active/inactive status

#### 2. Attendance Tracking
- **Operations → Attendance** - Log daily attendance
- Track days worked vs. absent each month
- Required for payroll calculations

#### 3. Payroll Processing
- **Operations → Run Payroll** - Calculate and generate payroll
- Select employee and month
- System applies deductions and bonuses automatically
- Review results before finalizing

#### 4. Records Management
- **Records → Payroll Records** - View all processed payroll
- **Records → Deductions** - Manage employee deductions/debts
- **Records → Savings** - Track employee savings accounts

### Monthly Payroll Workflow

1. **Verify Attendance**
   - Go to **Operations → Attendance**
   - Confirm all employee attendance is recorded for the month

2. **Update Obligations** (if needed)
   - Check **Records → Deductions** for any new deductions
   - Check **Records → Savings** for any account updates

3. **Run Payroll**
   - Go to **Operations → Run Payroll**
   - Select employees or payroll group
   - Click "Generate" and review results

4. **Finalize**
   - Review **Records → Payroll Records**
   - Verify calculations are correct
   - Export or print if needed

### Employee Types & Rules

#### Common Payroll Groups
- **monthly** - Standard monthly salary, mandatory if employee has debt deductions
- **no-cut** - Different deduction profile, cannot use with 10-day holding
- **savings** - Employees with savings account tracking

#### Important Rules
- Employees with **debt deductions** must use the **monthly** group
- Employees with **10-day holding** cannot use **no-cut** group
- All required fields must be filled before saving

### Troubleshooting User Issues

| Problem | Solution |
|---------|----------|
| App won't start | Ensure MongoDB service is running (Windows Services) |
| "Not authenticated" | Click "Sign In" and re-enter credentials |
| Changes not saving | Check MongoDB is running; restart app if needed |
| Employee not found | Search by exact name; check if employee is Active |

---

## Privacy & Data Storage

- Employee/payroll data is stored in the client's local MongoDB instance.
- On startup, the app checks only local service availability (`localhost:27017` and required app ports).
- The app does **not** scan personal files, browser history, photos, documents, or cloud accounts.
- No data is transmitted outside the client PC unless an external server is intentionally configured.

---

## Project Structure

```
.
├── electron/                    # Electron desktop app
│   ├── main.js                 # App entry point
│   ├── preload.js              # Security layer
│   └── utils/
│       ├── waitForServer.js    # Startup coordination
│       └── mongoCheck.js       # MongoDB health check
├── back/                       # Express.js backend
│   ├── src/
│   │   ├── app.js
│   │   ├── index.js
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── models/
│   │   ├── services/
│   │   └── middleware/
│   └── package.json
├── front/                      # Angular frontend
│   ├── public/
│   │   ├── index.html
│   │   ├── app.js
│   │   └── style.css
│   ├── server.js              # Express dev server
│   └── package.json
├── assets/                     # App icons & resources
├── package.json               # Root config + Electron builder
├── INSTALLATION.md            # Client installation guide
└── README.md                  # This file
```

---

## Building & Distribution

### Development Build

```bash
npm run desktop:dev
```

### Production Build

```bash
npm run desktop:build
```

This will:
1. Build backend and frontend (if build scripts exist)
2. Run electron-builder with NSIS configuration
3. Create: `dist/Payroll-System-*.exe`

### Distribute to Clients

1. Share the `.exe` file from the `dist/` folder
2. Provide the [INSTALLATION.md](INSTALLATION.md) guide
3. Clients must have MongoDB installed first

---

## Configuration

### Environment Variables

Create `.env` in the project root:

```env
MONGODB_URI=mongodb://localhost:27017/payroll
BACKEND_PORT=4000
FRONTEND_PORT=3000
```

### Electron Builder Config

Located in `package.json` under `"build"`:
- **NSIS configuration** - Windows installer options
- **App metadata** - Name, ID, productName
- **File includes** - What gets packaged into the .exe

---

## Troubleshooting

### Development

**Port already in use:**
```bash
# Windows - find and kill process on port 3000/4000
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

**MongoDB connection fails:**
```bash
# Start MongoDB manually
mongod
```

**Electron won't open:**
- Check console output for errors
- Verify backend responds: `curl http://localhost:4000`
- Verify frontend responds: `curl http://localhost:3000`

### Building

**File not found errors:**
- Ensure all `npm install` commands completed
- Check that backend and frontend builds succeeded

**NSIS script error:**
- Requires Windows or Windows build tools
- May need to install electron-builder additional dependencies

---

## Next Steps

1. **Code Signing** - Add Windows code signing certificate for production
2. **Auto-Updates** - Implement electron-updater
3. **Crash Reporting** - Add Sentry or similar monitoring
4. **Application Logging** - Implement Winston for detailed logs
5. **Database Backups** - Add automatic backup features

---

## Support Resources

- [Electron Documentation](https://www.electronjs.org/docs)
- [MongoDB Documentation](https://docs.mongodb.com/)
- [Express.js Guide](https://expressjs.com/)
- [Angular Documentation](https://angular.io/docs)

**Version:** 1.0.0
**Last Updated:** February 2026
