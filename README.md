# Payroll System QOL — Client Step-by-Step Guide

This guide is for day-to-day use by payroll staff.

## 1) Start the system

1. Open a terminal in the project root folder: `Payroll-System-QOL`
2. Run:
	- `npm run dev`
3. Open your browser to:
	- `http://localhost:3000`

## 2) Sign in

1. Go to the **Login** page.
2. Enter your username and password.
3. Click **Sign In**.

## 3) Add an employee

Go to **People → Add Employee**.

### Common fields (for all employees)

1. Fill **Full name** and **Phone**.
2. Enter **Base salary**.
3. Set **Start date**.
4. Keep **Active** checked (unless employee should be inactive).
5. Set payroll flags if needed:
	- **Apply $20 deduction profile**
	- **Withhold 10-day holding**
	- **Has debt deduction**

### Payroll group selection rules (important)

- If **Has debt deduction** is checked, only **monthly** is allowed.
- If **$20 deduction** or **10-day holding** is checked, **no-cut** is not allowed.
- Disabled groups appear grey.
- Hover/focus the payroll group box to see warning messages.

### Optional multi/none selection mode

- Enable **Allow multiple or no group selection** if you want flexibility while deciding.
- You can select multiple groups or none.
- On save, the system auto-resolves to one valid payroll group.

## 4) Process a long-time employee (already employed before now)

Use this flow when adding someone who has already been working for a while.

1. Add the employee record (Section 3), using their real historical **Start date**.
2. Go to **Operations → Attendance**.
3. Enter attendance for the payroll month (days worked/absent).
4. If needed, add existing obligations:
	- **Records → Deductions** for debt entries
	- **Records → Savings** for savings amount/accumulated amount
5. Go to **Operations → Run Payroll**.
6. Select employee + month and run payroll.
7. Verify results in **Records → Payroll Records**.

## 5) Process a brand-new employee

Use this flow for a new hire.

1. Add the employee record (Section 3) with the actual new hire **Start date**.
2. Enter attendance for the current month.
	- Example: if hired mid-month, days worked should only reflect worked days.
3. Run payroll from **Operations → Run Payroll**.
4. Review output in **Records → Payroll Records**.

## 6) Monthly payroll routine (recommended)

1. Confirm all employee attendance is complete.
2. Confirm any deductions/savings updates are complete.
3. Run payroll for required employees or payroll group.
4. Review payroll records.
5. Export records if needed.

## 7) Quick checks before clicking Save/Run

- Name, payroll group, and base salary are filled.
- Payroll group is not greyed out (or let auto-resolve choose one).
- Attendance month is correct (`YYYY-MM` in payroll contexts).
- Employee is Active.

## 8) If you see errors

- **Not authenticated**: log in again.
- **Incompatible payroll group**: adjust flags or choose an allowed group.
- **Employee already exists**: check for same name + phone.

---

For technical API/setup details, see:
- `back/README.md`
- `front/README.md`
