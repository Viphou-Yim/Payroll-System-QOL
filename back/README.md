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

New endpoints

- POST `/api/payroll/generate/employee` → run payroll for a single employee. Body: `{ "employeeId": "<id>", "month": "YYYY-MM" }`
- POST `/api/payroll/schedule/start` → start monthly scheduler (body `{ "payroll_group": "cut", "cronExpression": "0 5 1 * *" }` optional).
- POST `/api/payroll/schedule/stop` → stop the scheduler.- POST `/api/payroll/undo` → undo payroll for a month. Body: `{ "month": "YYYY-MM" }`
- POST `/api/payroll/recalculate` → undo+re-run for a month. Body: `{ "month": "YYYY-MM", "payroll_group": "cut" }`
- GET `/api/payroll/holds?month=YYYY-MM` → list holds. POST `/api/payroll/holds/clear` body `{ deductionId }` clears a hold.
- GET `/api/payroll/savings` → list savings. POST `/api/payroll/savings/:employeeId` body `{ amount?, resetAccumulated? }` updates saving.
Tests

- Unit tests for payroll calculation are in `back/__tests__/payrollService.test.js`. Run with: `cd back && npm test`.

If you want me to add endpoint-level tests or a persistent scheduler storage, I can add that next.
