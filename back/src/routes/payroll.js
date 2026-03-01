/*
  back/src/routes/payroll.js
  - API route definitions for payroll operations
  - Key endpoints:
    POST /generate               -> batch payroll for group
    POST /generate/employee      -> single employee payroll run
    POST /undo                   -> undo payroll for a month
    POST /recalculate            -> undo + re-run for a month
    GET /records                 -> list payroll records
    GET /holds, POST /holds/clear-> manage 10-day holds
    GET /savings, POST /savings/:employeeId -> view/update savings
    POST /schedule/start/stop    -> scheduler control
*/
const express = require('express');
const router = express.Router();
const controller = require('../controllers/payrollController');
const auth = require('../middleware/auth');
const sessionAuth = require('../middleware/sessionAuth');
const { attendanceValidator, generateMonthValidator, generateEmployeeValidator, scheduleStartValidator } = require('../middleware/validation');

// require authenticated session or API key for all payroll endpoints
router.use(sessionAuth.requireAuth);
// admin-only actions will use sessionAuth.requireAdmin selectively


// POST /api/payroll/generate (batch by group)
router.post('/generate', sessionAuth.requireAdmin, generateMonthValidator, controller.generatePayrollForMonth);
// POST /api/payroll/generate/employee (single employee)
router.post('/generate/employee', sessionAuth.requireAdmin, generateEmployeeValidator, controller.generatePayrollForEmployee);

// Attendance endpoints (admin only to create/update)
router.post('/attendance', sessionAuth.requireAdmin, attendanceValidator, controller.upsertAttendance);
router.get('/attendance', controller.listAttendance);

// Undo & recalculate (admin only)
router.post('/undo', sessionAuth.requireAdmin, controller.undoPayrollForMonth);
router.post('/recalculate', sessionAuth.requireAdmin, controller.recalculatePayrollForMonth);

// Holds management
router.get('/holds', controller.getHolds);
router.post('/holds/clear', controller.clearHold);

// Employees - list employees for admin UI
router.get('/employees', controller.listEmployees);
<<<<<<< HEAD
=======
router.get('/employees/all', sessionAuth.requireAdmin, controller.listAllEmployees);
router.post('/employees', sessionAuth.requireAdmin, controller.createEmployee);
router.patch('/employees/:id', sessionAuth.requireAdmin, controller.updateEmployee);
router.patch('/employees/:id/status', sessionAuth.requireAdmin, controller.updateEmployeeStatus);
router.post('/employees/:id/get-together/payout', sessionAuth.requireAdmin, controller.payoutGetTogetherBalance);
router.delete('/employees/:id', sessionAuth.requireAdmin, controller.deleteEmployee);
>>>>>>> 02064596e4d411ca9c62f90695d0cd2ea71f7a8a

// Deductions - allow creating deductions including `monthly_debt`
router.post('/deductions', controller.createDeduction);
// List, update, delete deductions (admin)
router.get('/deductions', controller.listDeductions);
router.patch('/deductions/:id', controller.updateDeduction);
router.delete('/deductions/:id', controller.deleteDeduction);
router.post('/debts/payments', sessionAuth.requireAdmin, controller.createDebtPayment);
router.get('/debts/payments', sessionAuth.requireAdmin, controller.listDebtPayments);
router.get('/debts/summary', sessionAuth.requireAdmin, controller.getDebtSummary);

// Savings
router.get('/savings', controller.getSavings);
router.post('/savings/:employeeId', controller.updateSaving);
router.post('/savings/payout', sessionAuth.requireAdmin, controller.payoutSavingsForFestival);
router.get('/get-together/payouts', sessionAuth.requireAdmin, controller.listGetTogetherPayouts);

// Scheduler endpoints (uses persisted scheduler)
router.post('/schedule/start', scheduleStartValidator, controller.startMonthlyScheduler);
router.post('/schedule/stop', controller.stopScheduler);
router.get('/schedule', controller.getSchedulerStatus);

// GET /api/payroll/records?month=YYYY-MM
router.get('/records', controller.getPayrollRecords);
<<<<<<< HEAD
=======
// Update/delete a single record (admin only)
router.patch('/records/:id', sessionAuth.requireAdmin, controller.updatePayrollRecord);
router.delete('/records/:id', sessionAuth.requireAdmin, controller.deletePayrollRecord);
>>>>>>> 02064596e4d411ca9c62f90695d0cd2ea71f7a8a
// Server-side CSV export: GET /api/payroll/export?month=YYYY-MM
router.get('/export', controller.exportPayrollCsv);

module.exports = router;
 