# Payroll Backend (cut group)

This backend implements a configurable "cut" payroll group using Node.js, Express and MongoDB (Mongoose).

Quick start

- Copy `.env.example` to `.env` and set `MONGODB_URI`.
- Install: `cd back && npm install`
- Seed sample data: `npm run seed`
- Run server: `npm run dev` (requires `nodemon`) or `npm start`

Endpoints

- POST /api/payroll/generate  { month: 'YYYY-MM', payroll_group: 'cut' }
- GET /api/payroll/records?month=YYYY-MM

Notes & assumptions

- Rounding uses `ROUND_DECIMALS` env var (default 2).
- `has_20_deduction` is implemented as a **flat** amount from base (env var `CUT_GROUP_20_DEDUCTION_AMOUNT`, default $20).
- `has_10day_holding` holds (base/30 * holdingDays) and records it as a 'hold' deduction (env var `CUT_GROUP_10DAY_HOLDING_DAYS`, default 10).
- Savings are deducted monthly and accumulated.

Payroll groups

- `cut` (default): applies profile $20 deduction and 10-day holding behavior.
- `no-cut`: **disables** the profile $20 deduction and 10-day holding — employees in this group only get static deductions and savings applied.
- `monthly`: pays full monthly base (ignore daysWorked) and applies `monthly_debt` deductions only when the month reaches 30 days (i.e., when `days_worked === 30`).

Creating monthly debts

- You can create `monthly_debt` deductions via the admin UI (`Run > Create Monthly Debt`) or the API: POST `/api/payroll/deductions` with body `{ employeeId, type: 'monthly_debt', amount, month: 'YYYY-MM', reason? }`. These will be applied and removed when payroll for that month is generated for the `monthly` group. Undoing the payroll will restore those `monthly_debt` deductions.

New endpoints

- POST `/api/payroll/generate/employee` → run payroll for a single employee. Body: `{ "employeeId": "<id>", "month": "YYYY-MM" }` (supports `force: true` to overwrite existing payroll and accepts `Idempotency-Key` header or body `idempotencyKey`)
- POST `/api/payroll/schedule/start` → start monthly scheduler (body `{ "payroll_group": "cut", "cronExpression": "0 5 1 * *" }` optional). Scheduler config is persisted to DB so jobs survive restarts.
- POST `/api/payroll/schedule/stop` → stop the scheduler. POST `/api/payroll/undo` → undo payroll for a month. Body: `{ "month": "YYYY-MM" }`
- POST `/api/payroll/recalculate` → undo+re-run for a month. Body: `{ "month": "YYYY-MM", "payroll_group": "cut" }`
- GET `/api/payroll/holds?month=YYYY-MM` → list holds. POST `/api/payroll/holds/clear` body `{ deductionId }` clears a hold.
- GET `/api/payroll/savings` → list savings. POST `/api/payroll/savings/:employeeId` body `{ amount?, resetAccumulated? }` updates saving.
- Attendance endpoints: POST `/api/payroll/attendance` body `{ employeeId, month, days_worked, days_absent? }` to create/update attendance. GET `/api/payroll/attendance?employeeId=&month=` to list.
- Admin UI: visit `/admin.html` to manage attendance, view payroll records, run payroll for a single employee, and export payroll records to CSV.
- Login: POST `/api/auth/login` with `{ username, password }` (defaults to `ADMIN_USER=admin` and `ADMIN_PASSWORD=password` from `.env`). Session is stored in a cookie (no tokens needed). Use `/api/auth/logout` to sign out.
- Roles: `ADMIN_ROLE` (default `admin`) applied to the env-based login; endpoints require a logged-in session with the appropriate role. For convenience the old `ADMIN_API_KEY` header is still supported as a fallback.

Tests

- Unit tests for payroll calculation are in `back/__tests__/payrollService.test.js`. Run with: `cd back && npm test`.
- I added endpoint tests for attendance and scheduler flows.

If you want, I can add a small attendance UI or enable a persisted scheduler dashboard in the admin UI next.
