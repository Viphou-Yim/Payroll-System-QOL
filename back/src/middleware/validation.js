const { body, query, header, validationResult } = require('express-validator');

const isValidMonth = (value) => /^(\d{4})-(0[1-9]|1[0-2])$/.test(value);

const validate = (validations) => async (req, res, next) => {
  await Promise.all(validations.map(v => v.run(req)));
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(e => e.msg).join('; ');
    return res.status(400).json({ message: errorMessages });
  }
  return next();
};

const attendanceValidator = validate([
  body('employeeId').exists().withMessage('employeeId is required'),
  body('month').exists().withMessage('month is required').bail().custom(isValidMonth).withMessage('month must be YYYY-MM'),
  body('start_date').exists().withMessage('start_date is required').bail().isISO8601().withMessage('start_date must be a valid date'),
  body('end_date').exists().withMessage('end_date is required').bail().isISO8601().withMessage('end_date must be a valid date'),
  body('days_absent').optional().isFloat({ min: 0 }).withMessage('days_absent must be non-negative number'),
  body('extra_deduction_amount').optional().isFloat({ min: 0 }).withMessage('extra_deduction_amount must be non-negative number'),
  body('penalty_amount').optional().isFloat({ min: 0 }).withMessage('penalty_amount must be non-negative number')
]);

const generateMonthValidator = validate([
  body('month').exists().withMessage('month is required').bail().custom(isValidMonth).withMessage('month must be YYYY-MM'),
  body('payroll_group').exists().withMessage('payroll_group is required'),
  body('zero_absence_bonus_enabled').optional().isBoolean().withMessage('zero_absence_bonus_enabled must be boolean'),
  body('zero_absence_bonus_amount').optional().isFloat({ min: 0 }).withMessage('zero_absence_bonus_amount must be non-negative number')
]);

const generateEmployeeValidator = validate([
  body('employeeId').exists().withMessage('employeeId is required'),
  body('month').exists().withMessage('month is required').bail().custom(isValidMonth).withMessage('month must be YYYY-MM'),
  // optional flags
  body('force').optional().isBoolean().withMessage('force must be boolean'),
  body('idempotencyKey').optional().isString().withMessage('idempotencyKey must be string'),
  body('zero_absence_bonus_enabled').optional().isBoolean().withMessage('zero_absence_bonus_enabled must be boolean'),
  body('zero_absence_bonus_amount').optional().isFloat({ min: 0 }).withMessage('zero_absence_bonus_amount must be non-negative number')
]);

const scheduleStartValidator = validate([
  body('payroll_group').optional().isString(),
  body('cronExpression').optional().isString()
]);

module.exports = {
  attendanceValidator,
  generateMonthValidator,
  generateEmployeeValidator,
  scheduleStartValidator
};