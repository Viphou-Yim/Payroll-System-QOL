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
  body('days_worked').exists().withMessage('days_worked is required').bail().isFloat({ min: 0, max: 31 }).withMessage('days_worked must be number 0-31'),
  body('days_absent').optional().isFloat({ min: 0 }).withMessage('days_absent must be non-negative number')
]);

const generateMonthValidator = validate([
  body('month').exists().withMessage('month is required').bail().custom(isValidMonth).withMessage('month must be YYYY-MM'),
  body('payroll_group').exists().withMessage('payroll_group is required')
]);

const generateEmployeeValidator = validate([
  body('employeeId').exists().withMessage('employeeId is required'),
  body('month').exists().withMessage('month is required').bail().custom(isValidMonth).withMessage('month must be YYYY-MM'),
  // optional flags
  body('force').optional().isBoolean().withMessage('force must be boolean'),
  body('idempotencyKey').optional().isString().withMessage('idempotencyKey must be string')
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