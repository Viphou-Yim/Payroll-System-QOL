(function(){
  const API = window.API_BASE || '';
  async function fetchJson(url, options = {}) {
    const skipSessionHandling = options.skipSessionHandling === true;
    delete options.skipSessionHandling;
    options.headers = options.headers || {};
    options.credentials = 'include'; // send cookies for session auth
    const res = await fetch((url.startsWith('http') ? url : API + url), options);
    const body = await res.json().catch(()=> ({}));

    const isAuthRoute = (url || '').includes('/api/auth/');
    if (res.status === 401 && !isAuthRoute && !skipSessionHandling && !window.__sessionExpiredNotified) {
      window.__sessionExpiredNotified = true;
      showToast('Session expired. Please sign in again.');
      showAuthState(false);
      window.location.hash = '#login';
    }

    return { status: res.status, body, res };
  }

  function $(id){ return document.getElementById(id); }

  function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.style.display = 'block';
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.style.display = 'none'; }, 2000);
  }

  function setSelectLoading(selectEl, isLoading, message) {
    if (!selectEl) return;
    selectEl.disabled = isLoading;
    selectEl.innerHTML = '';
    const opt = document.createElement('option');
    opt.textContent = message || (isLoading ? 'Loading...' : 'Select');
    selectEl.appendChild(opt);
  }

  let allEmployees = [];
  let debtEmployees = [];

  function resolveEmployeeFromInputs(selectId, nameId, phoneId) {
    const selectedId = $(selectId)?.value;
    if (selectedId) return { employeeId: selectedId };

    const name = ($(nameId)?.value || '').trim().toLowerCase();
    const phone = ($(phoneId)?.value || '').trim().toLowerCase();

    if (!name && !phone) {
      return { employeeId: '', error: 'Please select an employee, or enter name/phone to match one.' };
    }

    const matches = allEmployees.filter((employee) => {
      const employeeName = (employee.name || '').toLowerCase();
      const employeePhone = (employee.phone || '').toLowerCase();
      const nameMatch = !name || employeeName.includes(name);
      const phoneMatch = !phone || employeePhone.includes(phone);
      return nameMatch && phoneMatch;
    });

    if (matches.length === 1) {
      const matched = matches[0];
      const sel = $(selectId);
      if (sel) sel.value = matched._id;
      if ($(nameId)) $(nameId).value = matched.name || '';
      if ($(phoneId)) $(phoneId).value = matched.phone || '';
      return { employeeId: matched._id };
    }

    if (matches.length === 0) {
      return { employeeId: '', error: 'No employee matched that name/phone. Select from dropdown or refine your search.' };
    }

    return { employeeId: '', error: 'Multiple employees matched. Please choose one from the dropdown.' };
  }

  function createEmployeeOption(e) {
    const opt = document.createElement('option');
    opt.value = e._id;
    const phone = e.phone ? ` (${e.phone})` : '';
    opt.textContent = `${e.name}${phone} - ${e.payroll_group}`;
    return opt;
  }

  function getFilteredEmployees(name = '', phone = '') {
    return allEmployees
      .filter(e => {
        const nameLower = (e.name || '').toLowerCase();
        const phoneLower = (e.phone || '').toLowerCase();
        const nameMatch = name.length === 0 || nameLower.includes(name.toLowerCase());
        const phoneMatch = phone.length === 0 || phoneLower.includes(phone.toLowerCase());
        return nameMatch && phoneMatch;
      })
      .sort((a, b) => (a.name || '').localeCompare((b.name || '')));
  }

  function filterAndPopulateSelect(selectId, name = '', phone = '') {
    const sel = $(selectId);
    if (!sel) return;
    sel.innerHTML = '<option value="">Select employee...</option>';

    const filtered = getFilteredEmployees(name, phone);

    filtered.forEach(e => sel.appendChild(createEmployeeOption(e)));
  }

  function setupEmployeeSearch(selectId, nameId, phoneId) {
    const nameInput = $(nameId);
    const phoneInput = $(phoneId);
    const sel = $(selectId);
    
    if (!nameInput || !phoneInput || !sel) return;
    if (nameInput.dataset.searchBound === 'true') return;
    nameInput.dataset.searchBound = 'true';

    nameInput.setAttribute('autocomplete', 'off');
    const suggestId = `${nameId}Suggest`;
    let suggestBox = $(suggestId);
    if (!suggestBox) {
      suggestBox = document.createElement('div');
      suggestBox.id = suggestId;
      suggestBox.className = 'emp-suggest';
      suggestBox.hidden = true;
      nameInput.insertAdjacentElement('afterend', suggestBox);
    }

    function hideSuggest() {
      suggestBox.hidden = true;
      suggestBox.innerHTML = '';
    }

    function getEmployeeById(id) {
      if (!id) return null;
      return allEmployees.find((emp) => String(emp._id) === String(id)) || null;
    }

    function syncFromEmployee(emp) {
      if (!emp) return;
      nameInput.value = emp.name || '';
      phoneInput.value = emp.phone || '';
      sel.value = emp._id;
    }

    function renderSuggest(filtered) {
      const q = (nameInput.value || '').trim();
      if (!q || filtered.length === 0) {
        hideSuggest();
        return;
      }
      suggestBox.innerHTML = '';
      filtered.slice(0, 8).forEach((emp) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'emp-suggest-item';
        item.textContent = emp.phone ? `${emp.name} (${emp.phone})` : emp.name;
        item.addEventListener('click', () => {
          syncFromEmployee(emp);
          filterAndPopulateSelect(selectId, nameInput.value, phoneInput.value);
          hideSuggest();
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        });
        suggestBox.appendChild(item);
      });
      suggestBox.hidden = false;
    }
    
    const updateFilter = () => {
      const name = nameInput.value;
      const phone = phoneInput.value;
      const filtered = getFilteredEmployees(name, phone);
      filterAndPopulateSelect(selectId, name, phone);
      renderSuggest(filtered);
      if (name.trim() && filtered.length === 1) {
        syncFromEmployee(filtered[0]);
        hideSuggest();
      }
    };
    
    nameInput.addEventListener('input', updateFilter);
    phoneInput.addEventListener('input', updateFilter);
    document.addEventListener('click', (e) => {
      if (e.target !== nameInput && !suggestBox.contains(e.target)) {
        hideSuggest();
      }
    });

    sel.addEventListener('change', () => {
      const emp = getEmployeeById(sel.value);
      if (!emp) return;
      nameInput.value = emp.name || '';
      phoneInput.value = emp.phone || '';
      hideSuggest();
    });
  }

  async function loadEmployees() {
    const sel = $('employeeSelect');
    setSelectLoading(sel, true);
    const runSel = $('runEmployeeSelect');
    const dedSel = $('dedEmployeeSelect');
    setSelectLoading(runSel, true);
    setSelectLoading(dedSel, true);
    const r = await fetchJson('/api/payroll/employees');
    if (r.status !== 200) {
      setSelectLoading(sel, true, 'Error loading');
      setSelectLoading(runSel, true, 'Error loading');
      setSelectLoading(dedSel, true, 'Error loading');
      return;
    }
    
    allEmployees = r.body || [];
    renderEmployees();
    
    // Populate attendance employee
    sel.innerHTML = '';
    allEmployees.forEach(e => sel.appendChild(createEmployeeOption(e)));
    setupEmployeeSearch('employeeSelect', 'attEmpName', 'attEmpPhone');
    
    // Populate run payroll employee
    runSel.innerHTML = '';
    allEmployees.forEach(e => runSel.appendChild(createEmployeeOption(e)));
    setupEmployeeSearch('runEmployeeSelect', 'runEmpName', 'runEmpPhone');
    
    // Populate deductions employee (include former/inactive when available)
    let deductionEmployees = allEmployees;
    const allEmpResp = await fetchJson('/api/payroll/employees/all', { skipSessionHandling: true });
    if (allEmpResp.status === 200 && Array.isArray(allEmpResp.body) && allEmpResp.body.length) {
      deductionEmployees = allEmpResp.body;
    }
    debtEmployees = deductionEmployees;
    dedSel.innerHTML = '';
    deductionEmployees.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e._id;
      const phone = e.phone ? ` (${e.phone})` : '';
      const status = e.active === false ? ' [former]' : '';
      opt.textContent = `${e.name}${phone}${status}`;
      dedSel.appendChild(opt);
    });
    setupEmployeeSearch('dedEmployeeSelect', 'dedEmpName', 'dedEmpPhone');
    
    if (typeof updateRunPreview === 'function') updateRunPreview();
  }

  // Inline validation and improved form UX for Attendance
  const attForm = document.getElementById('attendanceForm');
  if (attForm) {
    const parseDateOnly = (value) => {
      if (!value) return null;
      const [y, m, d] = value.split('-').map(Number);
      if (!y || !m || !d) return null;
      return new Date(Date.UTC(y, m - 1, d));
    };

    const formatDateOnly = (date) => {
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const getAttendancePeriodInfo = () => {
      const startDateRaw = attForm.attStartDate.value;
      const endDateRaw = attForm.attEndDate.value;
      const startDate = parseDateOnly(startDateRaw);
      const endDate = parseDateOnly(endDateRaw);

      if (!startDateRaw || !endDateRaw) {
        return { startDateRaw, endDateRaw, periodDays: null, workedDays: null };
      }
      if (!startDate || !endDate) {
        return { startDateRaw, endDateRaw, error: 'Start and end date must be valid dates.', periodDays: null, workedDays: null };
      }
      if (endDate < startDate) {
        return { startDateRaw, endDateRaw, error: 'End date must be on or after start date.', periodDays: null, workedDays: null };
      }

      const periodDays = Math.floor((endDate - startDate) / 86400000) + 1;
      const daysAbsent = parseFloat(attForm.attAbsent.value) || 0;
      const workedDays = Math.max(0, periodDays - daysAbsent);
      return { startDateRaw, endDateRaw, periodDays, workedDays };
    };

    const updateAttendancePreview = () => {
      const previewEl = document.getElementById('attPreview');
      if (!previewEl) return;
      const absent = parseFloat(attForm.attAbsent.value) || 0;
      const extraDeduction = parseFloat(attForm.attExtraDeduction?.value || '0') || 0;
      const penalty = parseFloat(attForm.attPenalty?.value || '0') || 0;
      const periodInfo = getAttendancePeriodInfo();

      const selectedId = document.getElementById('employeeSelect')?.value;
      const employee = allEmployees.find((emp) => String(emp._id) === String(selectedId));

      if (!periodInfo.startDateRaw || !periodInfo.endDateRaw) {
        previewEl.textContent = 'Preview: select start date and end date.';
        return;
      }
      if (periodInfo.error) {
        previewEl.textContent = `Preview: ${periodInfo.error}`;
        return;
      }

      const periodDays = periodInfo.periodDays || 0;
      const worked = periodInfo.workedDays || 0;

      if (!employee || employee.base_salary === undefined || employee.base_salary === null) {
        previewEl.textContent = `Preview: Period days ${periodDays} • Worked ${worked} • Extra deductions ${formatMoney(extraDeduction + penalty)}`;
        return;
      }

      const baseSalary = Number(employee.base_salary) || 0;
      const estimatedGross = ((baseSalary / 30) * Math.max(0, worked));
      const estimatedNetBeforeProfiles = Math.max(0, estimatedGross - extraDeduction - penalty);
      previewEl.textContent = `Preview: Period days ${periodDays} • Worked ${worked} • Estimated gross ${formatMoney(estimatedGross)} • Extra deductions ${formatMoney(extraDeduction + penalty)} • Est. net before profile deductions ${formatMoney(estimatedNetBeforeProfiles)}`;
    };

    attForm.addEventListener('input', () => {
      const daysAbsent = parseFloat(attForm.attAbsent.value) || 0;
      const extraDeduction = parseFloat(attForm.attExtraDeduction?.value || '0') || 0;
      const penalty = parseFloat(attForm.attPenalty?.value || '0') || 0;
      const periodInfo = getAttendancePeriodInfo();
      const worked = Number.isFinite(periodInfo.workedDays) ? periodInfo.workedDays : 0;
      attForm.attDays.value = String(Math.max(0, worked));

      const totalDaysEl = document.getElementById('attTotalDays');
      if (totalDaysEl) {
        totalDaysEl.textContent = Number.isFinite(periodInfo.periodDays)
          ? `Days in selected period: ${periodInfo.periodDays}`
          : 'Days in selected period: --';
      }

      let msg = '';
      if (periodInfo.error) msg = periodInfo.error;
      if (daysAbsent < 0) msg = 'Days absent must be ≥ 0';
      if (Number.isFinite(periodInfo.periodDays) && daysAbsent > periodInfo.periodDays) {
        msg = `Days absent (${daysAbsent}) cannot exceed days in selected period (${periodInfo.periodDays})`;
      }
      if (extraDeduction < 0 || penalty < 0) msg = 'Extra deduction and penalty must be ≥ 0';

      attForm.attStartDate.setCustomValidity(msg);
      attForm.attEndDate.setCustomValidity(msg);
      attForm.attAbsent.setCustomValidity(msg);
      if (attForm.attExtraDeduction) attForm.attExtraDeduction.setCustomValidity(msg);
      if (attForm.attPenalty) attForm.attPenalty.setCustomValidity(msg);
      document.getElementById('attValidation').textContent = msg;
      updateAttendancePreview();
    });

    document.getElementById('employeeSelect')?.addEventListener('change', updateAttendancePreview);
    document.getElementById('attStartDate')?.addEventListener('change', () => {
      const startDate = attForm.attStartDate.value;
      if (startDate) {
        if (!attForm.attEndDate.value) {
          const start = parseDateOnly(startDate);
          if (start) {
            const defaultEnd = new Date(start.getTime() + (30 * 86400000));
            attForm.attEndDate.value = formatDateOnly(defaultEnd);
          }
        }
      }
      attForm.dispatchEvent(new Event('input', { bubbles: true }));
    });

    document.getElementById('attEndDate')?.addEventListener('change', () => {
      attForm.dispatchEvent(new Event('input', { bubbles: true }));
    });

    attForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const resolvedEmployee = resolveEmployeeFromInputs('employeeSelect', 'attEmpName', 'attEmpPhone');
      const employeeId = resolvedEmployee.employeeId;
      const start_date = attForm.attStartDate.value;
      const end_date = attForm.attEndDate.value;
      const month = start_date ? start_date.slice(0, 7) : '';
      const days_absent = parseFloat(attForm.attAbsent.value) || 0;
      const extra_deduction_amount = parseFloat(attForm.attExtraDeduction?.value || '0') || 0;
      const penalty_amount = parseFloat(attForm.attPenalty?.value || '0') || 0;
      const validation = document.getElementById('attValidation');
      if (!employeeId) {
        validation.textContent = resolvedEmployee.error || 'Please select an employee.';
        return;
      }
      if (!start_date || !end_date) {
        validation.textContent = 'Start date and end date are required.';
        return;
      }
      if (
        attForm.attStartDate.validity.customError ||
        attForm.attEndDate.validity.customError ||
        attForm.attAbsent.validity.customError ||
        (attForm.attExtraDeduction && attForm.attExtraDeduction.validity.customError) ||
        (attForm.attPenalty && attForm.attPenalty.validity.customError)
      ) {
        validation.textContent = attForm.attStartDate.validationMessage || attForm.attEndDate.validationMessage || attForm.attAbsent.validationMessage || attForm.attExtraDeduction?.validationMessage || attForm.attPenalty?.validationMessage;
        return;
      }
      validation.textContent = '';
      const r = await fetchJson('/api/payroll/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, month, start_date, end_date, days_absent, extra_deduction_amount, penalty_amount })
      });
      if (r.status === 200) {
        document.getElementById('attMsg').textContent = '';
        showToast('Attendance saved');
        updateAttendancePreview();
      } else if (r.status === 401) {
        document.getElementById('attMsg').textContent = 'Session expired. Please sign in again.';
      } else {
        document.getElementById('attMsg').textContent = `Error: ${JSON.stringify(r.body) || r.status}`;
      }
    });
    updateAttendancePreview();
  }

  let currentRecords = [];
  let currentEmployees = [];
  let employeeDebtMap = new Map();

  function getEmployeeFilters() {
    return {
      search: ($('empListSearch')?.value || '').toLowerCase().trim(),
      phone: ($('empListPhone')?.value || '').toLowerCase().trim(),
      group: $('empListGroup')?.value || '',
      gender: $('empListGender')?.value || ''
    };
  }

  function filterEmployees(employees) {
    const { search, phone, group, gender } = getEmployeeFilters();
    return (employees || []).filter((employee) => {
      const nameVal = (employee.name || '').toLowerCase();
      const phoneVal = (employee.phone || '').toLowerCase();
      const groupVal = employee.payroll_group || '';
      const genderVal = (employee.gender || '').toLowerCase();
      if (search && !nameVal.includes(search)) return false;
      if (phone && !phoneVal.includes(phone)) return false;
      if (group && groupVal !== group) return false;
      if (gender && genderVal !== gender) return false;
      return true;
    }).sort((a, b) => (a.name || '').localeCompare((b.name || '')));
  }

  async function loadEmployeesForList() {
    const statusEl = $('employeesListStatus');
    if (statusEl) statusEl.textContent = 'Loading employees...';
    const r = await fetchJson('/api/payroll/employees/all');
    if (r.status !== 200) {
      currentEmployees = [];
      renderEmployeesTable([]);
      if (statusEl) statusEl.textContent = `Error loading employees`;
      return;
    }
    currentEmployees = Array.isArray(r.body) ? r.body : [];
    const debtResp = await fetchJson('/api/payroll/debts/summary', { skipSessionHandling: true });
    if (debtResp.status === 200) {
      const debtRows = Array.isArray(debtResp.body?.data) ? debtResp.body.data : [];
      employeeDebtMap = new Map(
        debtRows.map((row) => [String(row.employeeId), Number(row.remaining_balance) || 0])
      );
    } else {
      employeeDebtMap = new Map();
    }
    renderEmployeesTable(filterEmployees(currentEmployees));
  }

  function formatEmployeeDetails(employee) {
    const startDate = employee?.start_date ? new Date(employee.start_date) : null;
    const startText = startDate && !Number.isNaN(startDate.getTime()) ? startDate.toISOString().slice(0, 10) : '--';
    return [
      `Name: ${employee?.name || '--'}`,
      `Phone: ${employee?.phone || '--'}`,
      `Gender: ${employee?.gender || '--'}`,
      `Role: ${employee?.role || '--'}`,
      `Worker tag: ${employee?.worker_tag || '--'}`,
      `Meal mode: ${employee?.meal_mode || '--'}`,
      `Pay cycle day: ${employee?.pay_cycle_day || '--'}`,
      `Get together balance: ${formatMoney(employee?.get_together_balance || 0)}`,
      `Employee ID: ${employee?._id || '--'}`,
      `Payroll group: ${employee?.payroll_group || '--'}`,
      `Base salary: ${formatMoney(employee?.base_salary || 0)}`,
      `Start date: ${startText}`,
      `Has $20 deduction: ${employee?.has_20_deduction ? 'Yes' : 'No'}`,
      `Has 10-day holding: ${employee?.has_10day_holding ? 'Yes' : 'No'}`,
      `Has debt deduction: ${employee?.has_debt_deduction ? 'Yes' : 'No'}`,
      `Active: ${employee?.active ? 'Yes' : 'No'}`
    ].join('\n');
  }

  const employeeViewModal = $('employeeViewModal');
  const employeeEditModal = $('employeeEditModal');
  let activeEmployeeView = null;

  function openEmployeeView(employee) {
    if (!employeeViewModal) return;
    activeEmployeeView = employee || null;
    const body = $('employeeViewBody');
    if (body) body.textContent = formatEmployeeDetails(employee);
    employeeViewModal.setAttribute('aria-hidden', 'false');
  }

  function closeEmployeeView() {
    if (!employeeViewModal) return;
    employeeViewModal.setAttribute('aria-hidden', 'true');
  }

  function openEmployeeEdit(employee) {
    if (!employeeEditModal || !employee) return;
    $('employeeEditId').value = employee._id || '';
    $('employeeEditName').value = employee.name || '';
    $('employeeEditPhone').value = employee.phone || '';
    $('employeeEditGender').value = employee.gender || 'male';
    $('employeeEditRole').value = employee.role || 'employee';
    $('employeeEditWorkerTag').value = employee.worker_tag || '';
    $('employeeEditMealMode').value = employee.meal_mode || '';
    $('employeeEditPayCycleDay').value = String(employee.pay_cycle_day || (employee.role === 'manager' ? 1 : 20));
    $('employeeEditRole').dispatchEvent(new Event('change'));
    $('employeeEditSalary').value = employee.base_salary ?? 0;
    $('employeeEditGroup').value = employee.payroll_group || 'cut';
    $('employeeEditHas20').checked = !!employee.has_20_deduction;
    $('employeeEditHas10').checked = !!employee.has_10day_holding;
    $('employeeEditHasDebt').checked = !!employee.has_debt_deduction;
    $('employeeEditActive').checked = !!employee.active;
    const startDate = employee.start_date ? new Date(employee.start_date) : null;
    $('employeeEditStartDate').value = startDate && !Number.isNaN(startDate.getTime())
      ? startDate.toISOString().slice(0, 10)
      : '';
    const status = $('employeeEditStatus');
    if (status) status.textContent = '';
    employeeEditModal.setAttribute('aria-hidden', 'false');
  }

  function closeEmployeeEdit() {
    if (!employeeEditModal) return;
    employeeEditModal.setAttribute('aria-hidden', 'true');
  }

  async function deleteEmployee(employee) {
    if (!employee || !employee._id) return;
    const ok = window.confirm(`Delete employee "${employee.name || employee._id}"? This will remove payroll-related records for this employee.`);
    if (!ok) return;

    const r = await fetchJson(`/api/payroll/employees/${employee._id}`, {
      method: 'DELETE'
    });

    if (r.status !== 200) {
      showToast(r.body?.message || 'Failed to delete employee');
      return;
    }

    showToast('Employee deleted');
    closeEmployeeView();
    closeEmployeeEdit();
    await loadEmployeesForList();
    await loadEmployees();
  }

  async function setEmployeeActive(employeeId, active, checkboxEl) {
    if (!employeeId || !checkboxEl) return;
    checkboxEl.disabled = true;
    const r = await fetchJson(`/api/payroll/employees/${employeeId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active })
    });
    checkboxEl.disabled = false;

    if (r.status !== 200) {
      checkboxEl.checked = !active;
      showToast(r.body?.message || 'Failed to update status');
      return;
    }

    currentEmployees = currentEmployees.map((employee) => (
      String(employee._id) === String(employeeId)
        ? { ...employee, active: !!active }
        : employee
    ));
    showToast('Employee status updated');
    await loadEmployees();
    renderEmployeesTable(filterEmployees(currentEmployees));
  }

  async function payoutGetTogetherBalance(employeeId, confirmEl, remarkEl, buttonEl) {
    if (!employeeId || !confirmEl || !remarkEl || !buttonEl) return;
    if (!confirmEl.checked) {
      showToast('Tick confirm payout first');
      return;
    }
    const remark = String(remarkEl.value || '').trim();
    if (!remark) {
      showToast('Enter a remark for payout');
      return;
    }

    buttonEl.disabled = true;
    const r = await fetchJson(`/api/payroll/employees/${employeeId}/get-together/payout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmed: true, remark })
    });
    buttonEl.disabled = false;

    if (r.status !== 200) {
      showToast(r.body?.message || 'Payout failed');
      return;
    }

    showToast('Get together payout completed');
    confirmEl.checked = false;
    remarkEl.value = '';
    await loadEmployeesForList();
    await loadEmployees();
  }

  function renderEmployeesTable(employees) {
    const container = $('employeesList');
    const statusEl = $('employeesListStatus');
    if (!container) return;
    container.innerHTML = '';

    if (!Array.isArray(employees) || employees.length === 0) {
      container.textContent = 'No employees found';
      if (statusEl) statusEl.textContent = '0 employees';
      return;
    }

    if (statusEl) statusEl.textContent = `${employees.length} employee${employees.length === 1 ? '' : 's'}`;

    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    const tbl = document.createElement('table');
    const thead = document.createElement('thead');
    const header = document.createElement('tr');
    ['Name', 'Phone', 'Gender', 'Role', 'Pay Day', 'Payroll Group', 'Get Together', 'Remaining Debt', '$20', '10-Day Holding', 'Active', 'Employee ID', 'Actions'].forEach((title) => {
      const th = document.createElement('th');
      th.textContent = title;
      header.appendChild(th);
    });
    thead.appendChild(header);
    tbl.appendChild(thead);

    const tbody = document.createElement('tbody');
    employees.forEach((employee) => {
      const tr = document.createElement('tr');
      const remainingDebt = employeeDebtMap.get(String(employee._id)) || 0;
      tr.innerHTML = `<td>${employee.name || ''}</td><td>${employee.phone || ''}</td><td>${employee.gender || '--'}</td><td>${employee.role || '--'}</td><td>${employee.pay_cycle_day || '--'}</td><td>${employee.payroll_group || ''}</td><td>${formatMoney(employee.get_together_balance || 0)}</td><td>${formatMoney(remainingDebt)}</td><td>${employee.has_20_deduction ? 'Yes' : 'No'}</td><td>${employee.has_10day_holding ? 'Yes' : 'No'}</td><td class="employee-active-cell"></td><td>${employee._id || ''}</td><td class="employee-actions-cell"></td>`;
      const activeCell = tr.querySelector('.employee-active-cell');
      const activeCheckbox = document.createElement('input');
      activeCheckbox.type = 'checkbox';
      activeCheckbox.checked = !!employee.active;
      activeCheckbox.setAttribute('aria-label', `Set ${employee.name || 'employee'} active status`);
      activeCheckbox.addEventListener('change', () => {
        setEmployeeActive(employee._id, activeCheckbox.checked, activeCheckbox);
      });
      activeCell.appendChild(activeCheckbox);

      const actionsCell = tr.querySelector('.employee-actions-cell');
      const viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.className = 'secondary';
      viewBtn.textContent = 'View';
      viewBtn.addEventListener('click', () => {
        openEmployeeView(employee);
      });

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'secondary';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => {
        openEmployeeEdit(employee);
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'secondary';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => {
        deleteEmployee(employee);
      });

      const payoutWrap = document.createElement('div');
      payoutWrap.style.marginTop = '8px';
      payoutWrap.style.display = 'flex';
      payoutWrap.style.flexDirection = 'column';
      payoutWrap.style.gap = '6px';

      const payoutConfirm = document.createElement('label');
      payoutConfirm.style.display = 'flex';
      payoutConfirm.style.alignItems = 'center';
      payoutConfirm.style.gap = '6px';
      payoutConfirm.style.margin = '0';
      payoutConfirm.innerHTML = '<input type="checkbox" /> Confirm payout';
      const payoutCheckbox = payoutConfirm.querySelector('input');

      const payoutRemark = document.createElement('input');
      payoutRemark.type = 'text';
      payoutRemark.placeholder = 'Remark';

      const payoutBtn = document.createElement('button');
      payoutBtn.type = 'button';
      payoutBtn.className = 'secondary';
      payoutBtn.textContent = 'Payout $20 Pool';
      payoutBtn.addEventListener('click', () => {
        payoutGetTogetherBalance(employee._id, payoutCheckbox, payoutRemark, payoutBtn);
      });

      actionsCell.appendChild(viewBtn);
      actionsCell.appendChild(editBtn);
      actionsCell.appendChild(deleteBtn);
      payoutWrap.appendChild(payoutConfirm);
      payoutWrap.appendChild(payoutRemark);
      payoutWrap.appendChild(payoutBtn);
      actionsCell.appendChild(payoutWrap);

      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    wrap.appendChild(tbl);
    container.appendChild(wrap);
  }

  if (employeeViewModal) {
    employeeViewModal.addEventListener('click', (e) => {
      if (e.target?.getAttribute('data-close') === 'true') closeEmployeeView();
    });
  }
  $('employeeViewClose')?.addEventListener('click', closeEmployeeView);
  $('employeeViewEdit')?.addEventListener('click', () => {
    if (!activeEmployeeView) return;
    closeEmployeeView();
    openEmployeeEdit(activeEmployeeView);
  });
  $('employeeViewDelete')?.addEventListener('click', async () => {
    if (!activeEmployeeView) return;
    await deleteEmployee(activeEmployeeView);
  });

  if (employeeEditModal) {
    employeeEditModal.addEventListener('click', (e) => {
      if (e.target?.getAttribute('data-close') === 'true') closeEmployeeEdit();
    });
  }

  $('employeeEditRole')?.addEventListener('change', () => {
    const role = String($('employeeEditRole')?.value || '').trim().toLowerCase();
    const isWorker = role === 'worker';
    const workerTagEl = $('employeeEditWorkerTag');
    const mealModeEl = $('employeeEditMealMode');
    const payCycleEl = $('employeeEditPayCycleDay');
    if (workerTagEl) {
      workerTagEl.disabled = !isWorker;
      if (!isWorker) workerTagEl.value = '';
      if (isWorker && !workerTagEl.value) workerTagEl.value = 'worker';
    }
    if (mealModeEl) {
      mealModeEl.disabled = !isWorker;
      if (!isWorker) mealModeEl.value = '';
    }
    if (payCycleEl) {
      payCycleEl.value = role === 'manager' ? '1' : '20';
    }
  });
  $('employeeEditClose')?.addEventListener('click', closeEmployeeEdit);
  $('employeeEditCancel')?.addEventListener('click', closeEmployeeEdit);

  $('employeeEditForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('employeeEditId').value;
    const name = String($('employeeEditName').value || '').trim();
    const phone = String($('employeeEditPhone').value || '').trim();
    const gender = String($('employeeEditGender').value || '').trim().toLowerCase();
    const role = String($('employeeEditRole').value || '').trim().toLowerCase();
    const worker_tag = String($('employeeEditWorkerTag').value || '').trim().toLowerCase();
    const meal_mode = String($('employeeEditMealMode').value || '').trim().toLowerCase();
    const pay_cycle_day = Number($('employeeEditPayCycleDay').value || '20');
    const base_salary = parseFloat($('employeeEditSalary').value);
    const payroll_group = String($('employeeEditGroup').value || '').trim();
    const has_20_deduction = !!$('employeeEditHas20').checked;
    const has_10day_holding = !!$('employeeEditHas10').checked;
    const has_debt_deduction = !!$('employeeEditHasDebt').checked;
    const active = !!$('employeeEditActive').checked;
    const start_date = $('employeeEditStartDate').value || '';
    const status = $('employeeEditStatus');

    if (!id) {
      if (status) status.textContent = 'Employee id is missing.';
      return;
    }
    if (!name) {
      if (status) status.textContent = 'Name is required.';
      return;
    }
    if (Number.isNaN(base_salary)) {
      if (status) status.textContent = 'Base salary must be a number.';
      return;
    }
    if (!['male', 'female'].includes(gender)) {
      if (status) status.textContent = 'Gender must be male or female.';
      return;
    }
    if (!['employee', 'worker', 'manager', 'car_driver', 'tuk_tuk_driver'].includes(role)) {
      if (status) status.textContent = 'Role is invalid.';
      return;
    }
    if (![1, 20].includes(pay_cycle_day)) {
      if (status) status.textContent = 'Pay cycle day must be 1 or 20.';
      return;
    }
    if (!['cut', 'no-cut', 'monthly'].includes(payroll_group)) {
      if (status) status.textContent = 'Payroll group must be cut, no-cut, or monthly.';
      return;
    }

    if (status) status.textContent = '';
    const r = await fetchJson(`/api/payroll/employees/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        phone,
        gender,
        role,
        worker_tag,
        meal_mode,
        pay_cycle_day,
        base_salary,
        payroll_group,
        has_20_deduction,
        has_10day_holding,
        has_debt_deduction,
        start_date: start_date || null,
        active
      })
    });

    if (r.status !== 200) {
      if (status) status.textContent = r.body?.message || 'Failed to update employee';
      return;
    }

    if (active !== undefined) {
      await fetchJson(`/api/payroll/employees/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active })
      });
    }

    showToast('Employee updated');
    closeEmployeeEdit();
    await loadEmployeesForList();
    await loadEmployees();
  });

  function renderEmployees() {
    currentEmployees = [...currentEmployees];
    const filtered = filterEmployees(currentEmployees);
    renderEmployeesTable(filtered);
  }

  function getRecordFilters() {
    return {
      search: ($('recSearch')?.value || '').toLowerCase().trim(),
      status: $('recStatus')?.value || '',
      netMin: parseFloat($('recNetMin')?.value),
      netMax: parseFloat($('recNetMax')?.value)
    };
  }
  function filterRecords(records) {
    const { search, status, netMin, netMax } = getRecordFilters();
    return records.filter(rec => {
      const empName = rec.employee?.name || rec.employee || '';
      const net = Number(rec.net_salary || 0);
      if (search && !empName.toLowerCase().includes(search)) return false;
      if (status === 'paid' && net <= 0) return false;
      if (status === 'zero' && net > 0) return false;
      if (!Number.isNaN(netMin) && net < netMin) return false;
      if (!Number.isNaN(netMax) && net > netMax) return false;
      return true;
    });
  }
  function escapeCsv(val) { if (val === null || val === undefined) return ''; const s = typeof val === 'string' ? val : String(val); if (s.includes(',') || s.includes('\n') || s.includes('"')) { return '"' + s.replace(/"/g,'""') + '"'; } return s; }
  function formatDeductionsText(deductions) {
    const list = Array.isArray(deductions) ? deductions : [];
    if (!list.length) return '';
    return list.map((deduction) => {
      const type = deduction?.type || 'deduction';
      const amount = Number(deduction?.amount || 0);
      const reason = deduction?.reason ? ` (${deduction.reason})` : '';
      return `${type}: ${formatMoney(amount)}${reason}`;
    }).join('; ');
  }
  function downloadCsv(filename, rows) { const csv = rows.join('\n'); const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 1000); }
  function recordsToCsvRows(records) { const header = ['Employee','Gender','EmployeeId','Month','Gross','TotalDeductions','Net','Withheld','CarryoverSavings','Bonuses','Deductions']; const rows = [header.join(',')]; for (const r of records) { const emp = r.employee ? r.employee.name : (r.employee || ''); const gender = r.employee?.gender || ''; const empId = r.employee && r.employee._id ? r.employee._id : (r.employee || ''); const deductionsText = formatDeductionsText(r.deductions); const row = [escapeCsv(emp), escapeCsv(gender), escapeCsv(empId), escapeCsv(r.month), escapeCsv(r.gross_salary), escapeCsv(r.total_deductions), escapeCsv(r.net_salary), escapeCsv(r.withheld_amount), escapeCsv(r.carryover_savings), escapeCsv(r.bonuses), escapeCsv(deductionsText)]; rows.push(row.join(',')); } return rows; }
  function recordsToExportRows(records) {
    return (records || []).map((r) => ({
      Employee: r.employee ? r.employee.name : (r.employee || ''),
      Gender: r.employee?.gender || '',
      EmployeeId: r.employee && r.employee._id ? r.employee._id : (r.employee || ''),
      Month: r.month || '',
      Gross: Number(r.gross_salary || 0),
      TotalDeductions: Number(r.total_deductions || 0),
      Net: Number(r.net_salary || 0),
      Withheld: Number(r.withheld_amount || 0),
      CarryoverSavings: Number(r.carryover_savings || 0),
      Bonuses: Number(r.bonuses || 0),
      Deductions: formatDeductionsText(r.deductions)
    }));
  }
  function downloadExcel(filename, records) {
    if (!window.XLSX) {
      alert('Excel export library not loaded. Please refresh and try again.');
      return;
    }
    const rows = recordsToExportRows(records);
    const wb = window.XLSX.utils.book_new();
    const ws = window.XLSX.utils.json_to_sheet(rows);
    window.XLSX.utils.book_append_sheet(wb, ws, 'PayrollRecords');
    window.XLSX.writeFile(wb, filename);
  }
  function downloadPdfTable(filename, records) {
    const jsPdfLib = window.jspdf && window.jspdf.jsPDF;
    if (!jsPdfLib) {
      alert('PDF export library not loaded. Please refresh and try again.');
      return;
    }
    const rows = recordsToExportRows(records);
    const headers = ['Employee','Gender','EmployeeId','Month','Gross','TotalDeductions','Net','Withheld','CarryoverSavings','Bonuses','Deductions'];
    const body = rows.map((row) => headers.map((h) => row[h]));
    const doc = new jsPdfLib({ orientation: 'landscape' });
    doc.setFontSize(12);
    doc.text('Payroll Records', 14, 14);
    if (typeof doc.autoTable !== 'function') {
      alert('PDF table plugin not loaded. Please refresh and try again.');
      return;
    }
    doc.autoTable({
      head: [headers],
      body,
      startY: 20,
      styles: { fontSize: 8 }
    });
    doc.save(filename);
  }
  function showRecordDetails(rec) {
    const d = $('recordDetails');
    d.style.display = 'block';

    const emp = rec.employee
      ? `${rec.employee.name} (${rec.employee._id})`
      : (rec.employee || '');

    const cardHtml = formatRunResult(rec, emp);
    const payrollId = rec?._id ? `<div class="run-row"><span class="run-label">Payroll ID:</span> ${escapeHtml(rec._id)}</div>` : '';
    const createdAt = rec?.createdAt ? `<div class="run-row"><span class="run-label">Created:</span> ${escapeHtml(formatDate(rec.createdAt))}</div>` : '';

    d.innerHTML = `
      ${cardHtml}
      <div class="run-result" style="margin-top:12px;">
        ${payrollId}
        ${createdAt}
      </div>
      <div class="form-actions" style="margin-top:12px;margin-bottom:0;">
        <button id="exportRecBtn" type="button">Export This Record CSV</button>
      </div>
    `;

    const exportBtn = document.getElementById('exportRecBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const rows = recordsToCsvRows([rec]);
        downloadCsv(`payroll_${rec.employee && rec.employee._id ? rec.employee._id : 'record'}_${rec.month}.csv`, rows);
      });
    }
  }

  $('loadRecords').addEventListener('click', () => { renderRecords(); });

  const loadEmployeesListBtn = $('loadEmployeesList');
  if (loadEmployeesListBtn) {
    loadEmployeesListBtn.addEventListener('click', async () => {
      await loadEmployeesForList();
    });
  }

  ['empListSearch', 'empListPhone', 'empListGroup', 'empListGender'].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('input', () => renderEmployeesTable(filterEmployees(currentEmployees)));
    el.addEventListener('change', () => renderEmployeesTable(filterEmployees(currentEmployees)));
  });

  $('clearEmployeesFilters')?.addEventListener('click', () => {
    if ($('empListSearch')) $('empListSearch').value = '';
    if ($('empListPhone')) $('empListPhone').value = '';
    if ($('empListGroup')) $('empListGroup').value = '';
    if ($('empListGender')) $('empListGender').value = '';
    renderEmployeesTable(filterEmployees(currentEmployees));
  });

  function renderRecordsTable(records) {
    const container = $('recordsList');
    container.innerHTML = '';
    if (!Array.isArray(records) || records.length === 0) { container.textContent = 'No records found'; return; }
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    const tbl = document.createElement('table');
    const thead = document.createElement('thead');
    const h = document.createElement('tr');
    ['Employee','Gender','Month','Gross','Deductions','Net','Actions'].forEach(t => { const th = document.createElement('th'); th.textContent = t; h.appendChild(th); });
    thead.appendChild(h);
    tbl.appendChild(thead);
    const tbody = document.createElement('tbody');
    records.forEach(rec => {
      const tr = document.createElement('tr'); const emp = rec.employee ? rec.employee.name : (rec.employee || ''); const gender = rec.employee?.gender || '--'; const viewBtn = `<button class="viewBtn">View</button>`;
      tr.innerHTML = `<td>${emp}</td><td>${gender}</td><td>${rec.month}</td><td>${rec.gross_salary}</td><td>${rec.total_deductions}</td><td>${rec.net_salary}</td><td>${viewBtn}</td>`;
      tr.querySelector('.viewBtn').addEventListener('click', () => showRecordDetails(rec));
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    wrap.appendChild(tbl);
    container.appendChild(wrap);
  }
  async function renderRecords() {
    const month = $('recMonth').value;
    const r = await fetchJson(`/api/payroll/records?month=${encodeURIComponent(month)}`);
    const container = $('recordsList');
    if (r.status !== 200) { container.textContent = `Error: ${r.body.message || r.status}`; return; }
    currentRecords = r.body || [];
    const filtered = filterRecords(currentRecords);
    renderRecordsTable(filtered);
  }

  const exportExcelBtn = $('exportExcel');
  if (exportExcelBtn) {
    exportExcelBtn.addEventListener('click', () => {
      if (!currentRecords || currentRecords.length === 0) { alert('No records loaded'); return; }
      const month = $('recMonth').value || new Date().toISOString().slice(0,7);
      const filtered = filterRecords(currentRecords);
      if (!filtered.length) { alert('No records match your current filters'); return; }
      downloadExcel(`payroll_records_${month}.xlsx`, filtered);
    });
  }

  const exportPdfBtn = $('exportPdf');
  if (exportPdfBtn) {
    exportPdfBtn.addEventListener('click', () => {
      if (!currentRecords || currentRecords.length === 0) { alert('No records loaded'); return; }
      const month = $('recMonth').value || new Date().toISOString().slice(0,7);
      const filtered = filterRecords(currentRecords);
      if (!filtered.length) { alert('No records match your current filters'); return; }
      downloadPdfTable(`payroll_records_${month}.pdf`, filtered);
    });
  }

  // Records filters and export dropdown
  const exportMenuBtn = $('exportMenuBtn');
  const exportMenu = $('exportMenu');
  if (exportMenuBtn && exportMenu) {
    exportMenuBtn.addEventListener('click', () => {
      exportMenu.style.display = exportMenu.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', (e) => {
      if (!exportMenu.contains(e.target) && e.target !== exportMenuBtn) {
        exportMenu.style.display = 'none';
      }
    });
  }
  ['recSearch','recStatus','recNetMin','recNetMax'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('input', () => renderRecordsTable(filterRecords(currentRecords)));
  });

  async function refreshMe() {
    const r = await fetchJson('/api/auth/me', { skipSessionHandling: true });
    if (r.status === 200) {
      window.__sessionExpiredNotified = false;
      showAuthState(true, r.body.user);
    } else {
      showAuthState(false);
    }
    showRoute();
  }

  function showAuthState(isLoggedIn, user) {
    const loginForm = document.getElementById('loginForm');
    const loggedInState = document.getElementById('loggedInState');
    const mainNav = document.getElementById('mainNav');
    const userMenuName = document.getElementById('userMenuName');
    window.__authLoggedIn = isLoggedIn;
    if (isLoggedIn) {
      loginForm.style.display = 'none';
      loggedInState.style.display = '';
      if (userMenuName) userMenuName.textContent = user ? user.username : 'admin';
      if (mainNav) mainNav.hidden = false;
    } else {
      loginForm.style.display = '';
      loggedInState.style.display = 'none';
      if (mainNav) mainNav.hidden = true;
    }
  }

  $('loginBtn').addEventListener('click', async () => {
    const username = $('loginUser').value; const password = $('loginPass').value;
    $('loginStatus').textContent = 'Logging in…';
    $('loginBtn').disabled = true;
    const r = await fetchJson('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    $('loginBtn').disabled = false;
    if (r.status === 200) {
      window.__sessionExpiredNotified = false;
      $('loginStatus').textContent = '';
      showAuthState(true, r.body.user);
      await loadEmployees();
    } else {
      $('loginStatus').textContent = 'Invalid credentials';
      showAuthState(false);
    }
  });

  $('logoutBtn').addEventListener('click', async () => {
    $('loginStatus').textContent = 'Logging out…';
    $('logoutBtn').disabled = true;
    const r = await fetchJson('/api/auth/logout', { method: 'POST' });
    $('logoutBtn').disabled = false;
    if (r.status === 200) {
      $('loginStatus').textContent = '';
      showAuthState(false);
      window.location.hash = '#login';
      showRoute();
    } else {
      $('loginStatus').textContent = 'Logout failed';
    }
  });

  function showRoute() {
    const rawHash = (window.location.hash || '').replace('#','');
    const authed = window.__authLoggedIn === true;
    let route = rawHash || (authed ? 'dashboard' : 'login');
    if (!authed && route !== 'login' && route !== 'signup') route = 'login';
    if (authed && (route === 'login' || route === 'signup')) route = 'dashboard';
    if (!rawHash && !authed) {
      // keep landing page without hash for login
    }
    const authControls = document.getElementById('authControls');
    if (authControls) authControls.classList.toggle('auth-hidden', route === 'login' || route === 'signup');
    const mainNav = document.getElementById('mainNav');
    if (mainNav) mainNav.classList.toggle('nav-hidden', route === 'login' || route === 'signup');
    document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
    const el = document.querySelector(`[data-route="${route}"]`);
    if (el) {
      el.style.display = '';
      el.classList.add('page-load');
      setTimeout(() => el.classList.remove('page-load'), 400);
    }
    // Highlight active tab
    document.querySelectorAll('.tab-bar .tab').forEach(tab => {
      tab.classList.remove('active');
    });
    const activeTab = document.getElementById('tab-' + route);
    if (activeTab) activeTab.classList.add('active');
    // Grouping: visually separate
    if (route === 'dashboard') { loadDashboard(); }
    if (route === 'attendance') { loadEmployees(); }
    if (route === 'records') { renderRecords(); }
    if (route === 'records-summary') { loadRecordsSummary(); }
    if (route === 'get-together-history') { loadGetTogetherHistory(); }
    if (route === 'employees') { loadEmployeesForList(); }
    if (route === 'run') { loadEmployees(); }
    if (route === 'deductions') { loadDeductions(); loadEmployees(); }
    if (route === 'savings') { loadSavings(); }
    if (route === 'login') { setupLoginPage(); }
    if (route === 'signup') { setupSignupPage(); }
    if (route === 'account') { setupAccountPage(); }
    if (route === 'employee-add') { setupEmployeeAddPage(); }
  }

  function getCurrentMonth() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${now.getFullYear()}-${month}`;
  }

  function setDashboardValues({ payrollTotal, savingsHeld, debtTotal, debtEmployeeCount }) {
    const payrollEl = $('dashPayrollTotal');
    const savingsEl = $('dashSavingsHeld');
    const debtTotalEl = $('dashDebtTotal');
    const debtMetaEl = $('dashDebtMeta');
    if (payrollEl) payrollEl.textContent = formatMoney(payrollTotal);
    if (savingsEl) savingsEl.textContent = formatMoney(savingsHeld);
    if (debtTotalEl) debtTotalEl.textContent = formatMoney(debtTotal);
    if (debtMetaEl) {
      const noun = debtEmployeeCount === 1 ? 'employee' : 'employees';
      debtMetaEl.textContent = `${debtEmployeeCount} ${noun} with debt`;
    }
  }

  async function loadDashboard() {
    const monthInput = $('dashMonth');
    const status = $('dashStatus');
    if (monthInput && !monthInput.value) monthInput.value = getCurrentMonth();
    const month = monthInput?.value || getCurrentMonth();

    if (status) {
      status.style.display = '';
      status.textContent = 'Loading';
    }

    const [recordsResp, savingsResp, deductionsResp] = await Promise.all([
      fetchJson(`/api/payroll/records?month=${encodeURIComponent(month)}`),
      fetchJson('/api/payroll/savings'),
      fetchJson('/api/payroll/deductions')
    ]);

    if (recordsResp.status !== 200 || savingsResp.status !== 200 || deductionsResp.status !== 200) {
      setDashboardValues({ payrollTotal: 0, savingsHeld: 0, debtTotal: 0, debtEmployeeCount: 0 });
      if (status) status.textContent = 'Error';
      return;
    }

    const records = Array.isArray(recordsResp.body) ? recordsResp.body : [];
    const savings = Array.isArray(savingsResp.body) ? savingsResp.body : [];
    const deductions = Array.isArray(deductionsResp.body) ? deductionsResp.body : [];

    const payrollTotal = records.reduce((sum, record) => sum + (parseFloat(record.net_salary) || 0), 0);
    const savingsHeld = savings.reduce((sum, saving) => sum + (parseFloat(saving.accumulated_total) || 0), 0);

    const debtRows = deductions.filter((deduction) => {
      const isDebtType = deduction.type === 'debt' || deduction.type === 'monthly_debt';
      if (!isDebtType) return false;
      if (!month) return true;
      return deduction.month === month;
    });
    const debtTotal = debtRows.reduce((sum, deduction) => sum + (parseFloat(deduction.amount) || 0), 0);
    const debtEmployeeCount = new Set(
      debtRows.map((deduction) => deduction.employee?._id || deduction.employee).filter(Boolean)
    ).size;

    setDashboardValues({ payrollTotal, savingsHeld, debtTotal, debtEmployeeCount });
    if (status) status.style.display = 'none';
  }

  if ($('loadDashboard')) $('loadDashboard').addEventListener('click', loadDashboard);
  if ($('dashMonth')) $('dashMonth').addEventListener('change', loadDashboard);

  function setupLoginPage() {
    const form = document.getElementById('loginFormPage');
    const status = document.getElementById('lsStatus');
    const loginBtn = document.getElementById('lsLoginBtn');
    if (!form) return;
    form.onsubmit = async (e) => {
      e.preventDefault();
      loginBtn.disabled = true;
      status.textContent = 'Logging in…';
      const username = form.lsUsername.value;
      const password = form.lsPassword.value;
      const r = await fetchJson('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      loginBtn.disabled = false;
      if (r.status === 200) {
        window.__sessionExpiredNotified = false;
        status.textContent = '';
        window.location.hash = '#dashboard';
        refreshMe();
      } else {
        status.textContent = 'Invalid credentials';
      }
    };
  }

  function setupSignupPage() {
    const form = document.getElementById('signupForm');
    const status = document.getElementById('suStatus');
    const signupBtn = document.getElementById('suSignupBtn');
    if (!form) return;
    form.onsubmit = async (e) => {
      e.preventDefault();
      signupBtn.disabled = true;
      status.textContent = 'Signing up…';
      const username = form.suUsername.value;
      const email = form.suEmail.value;
      const password = form.suPassword.value;
      const confirm = form.suConfirm.value;
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      const passwordOk = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password);
      if (!emailOk) {
        status.textContent = 'Enter a valid email address.';
        signupBtn.disabled = false;
        return;
      }
      if (!passwordOk) {
        status.textContent = 'Password must be at least 8 characters and include a letter and a number.';
        signupBtn.disabled = false;
        return;
      }
      if (password !== confirm) {
        status.textContent = 'Passwords do not match.';
        signupBtn.disabled = false;
        return;
      }
      const r = await fetchJson('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, email, password }) });
      signupBtn.disabled = false;
      if (r.status === 200) {
        status.textContent = 'Signup successful! You can now sign in.';
        window.location.hash = '#login';
      } else {
        status.textContent = r.body && r.body.message ? r.body.message : 'Signup failed';
      }
    };
  }

  function setupAccountPage() {
    const form = document.getElementById('accountForm');
    const status = document.getElementById('acctStatus');
    const saveBtn = document.getElementById('acctSaveBtn');
    if (!form) return;
    form.onsubmit = async (e) => {
      e.preventDefault();
      saveBtn.disabled = true;
      status.textContent = 'Saving…';
      const currentPassword = form.acctCurrent.value;
      const newPassword = form.acctNew.value;
      const confirm = form.acctConfirm.value;
      const passwordOk = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(newPassword);
      if (!passwordOk) {
        status.textContent = 'Password must be at least 8 characters and include a letter and a number.';
        saveBtn.disabled = false;
        return;
      }
      if (newPassword !== confirm) {
        status.textContent = 'Passwords do not match.';
        saveBtn.disabled = false;
        return;
      }
      const r = await fetchJson('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      saveBtn.disabled = false;
      if (r.status === 200) {
        status.textContent = 'Password updated.';
        form.reset();
      } else {
        status.textContent = r.body && r.body.message ? r.body.message : 'Update failed';
      }
    };
  }
  window.addEventListener('hashchange', showRoute);

  // Records summary
  const summaryState = { records: [], page: 1, pageSize: 8 };
  let currentGetTogetherHistoryRows = [];
  const recSumBody = $('recSummaryBody');
  const recSumStatus = $('recSumStatus');
  let currentSummaryRecord = null;

  function formatDate(value) {
    if (!value) return '--';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString();
  }

  function renderSummaryTable() {
    if (!recSumBody) return;
    recSumBody.innerHTML = '';
    const start = (summaryState.page - 1) * summaryState.pageSize;
    const end = start + summaryState.pageSize;
    const slice = summaryState.records.slice(start, end);
    if (slice.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 9;
      td.textContent = 'No records found.';
      tr.appendChild(td);
      recSumBody.appendChild(tr);
      return;
    }
    slice.forEach(r => {
      const tr = document.createElement('tr');
      const empName = r.employee?.name || r.employee || '--';
      const gender = r.employee?.gender || '--';
      const group = r.employee?.payroll_group || '--';
      tr.innerHTML = `
        <td>${r._id || '--'}</td>
        <td>${empName}</td>
        <td>${gender}</td>
        <td>${group}</td>
        <td>${r.month || '--'}</td>
        <td>${r.net_salary ?? '--'}</td>
        <td>${r.gross_salary ?? '--'}</td>
        <td>${formatDate(r.createdAt)}</td>
        <td></td>
      `;
      const actions = document.createElement('div');
      actions.className = 'summary-actions';
      const viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.textContent = 'View';
      viewBtn.addEventListener('click', () => openSummaryView(r));
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'secondary';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => openSummaryEdit(r));
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'secondary';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => deleteSummaryRecord(r));
      actions.appendChild(viewBtn);
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      tr.lastElementChild.appendChild(actions);
      recSumBody.appendChild(tr);
    });
    const pageEl = $('recSumPage');
    if (pageEl) pageEl.textContent = `Page ${summaryState.page}`;
  }

  async function loadRecordsSummary() {
    if (!recSumBody) return;
    if (recSumStatus) {
      recSumStatus.style.display = '';
      recSumStatus.textContent = 'Loading';
    }
    const month = $('recSumMonth')?.value;
    const url = month ? `/api/payroll/records?month=${encodeURIComponent(month)}` : '/api/payroll/records';
    const r = await fetchJson(url);
    if (r.status !== 200) {
      recSumBody.innerHTML = '<tr><td colspan="8">Error loading records.</td></tr>';
      if (recSumStatus) recSumStatus.textContent = 'Error';
      return;
    }
    summaryState.records = Array.isArray(r.body) ? r.body : [];
    summaryState.records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    summaryState.page = 1;
    renderSummaryTable();
    if (recSumStatus) recSumStatus.style.display = 'none';
  }

  async function loadGetTogetherHistory() {
    const status = $('gtHistoryStatus');
    const totals = $('gtHistoryTotals');
    const listEl = $('gtHistoryList');
    const month = $('gtMonth')?.value || '';

    if (status) {
      status.style.display = '';
      status.textContent = 'Loading';
    }

    const query = month ? `?month=${encodeURIComponent(month)}` : '';
    const r = await fetchJson(`/api/payroll/get-together/payouts${query}`);
    if (r.status !== 200) {
      if (listEl) listEl.textContent = `Error: ${r.body?.message || r.status}`;
      if (totals) totals.textContent = 'Unable to load totals.';
      if (status) status.textContent = 'Error';
      return;
    }

    const rows = Array.isArray(r.body?.data) ? r.body.data : [];
    currentGetTogetherHistoryRows = rows;
    const payoutCount = Number(r.body?.totals?.payout_count) || 0;
    const totalAmount = Number(r.body?.totals?.total_amount) || 0;
    if (totals) totals.textContent = `${payoutCount} payout${payoutCount === 1 ? '' : 's'} • Total ${formatMoney(totalAmount)}`;

    if (!listEl) return;
    listEl.innerHTML = '';
    if (!rows.length) {
      listEl.textContent = 'No get together payouts found.';
      if (status) status.style.display = 'none';
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    const tbl = document.createElement('table');
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    ['Date', 'Employee', 'Role', 'Gender', 'Amount', 'Remark'].forEach((title) => {
      const th = document.createElement('th');
      th.textContent = title;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    tbl.appendChild(thead);

    const tbody = document.createElement('tbody');
    rows.forEach((row) => {
      const tr = document.createElement('tr');
      const employeeName = row.employee?.name || '--';
      const role = row.employee?.role || '--';
      const gender = row.employee?.gender || '--';
      const created = row.createdAt ? formatDate(row.createdAt) : '--';
      const remark = String(row.reason || '')
        .replace(/^Get together payout:\s*/i, '')
        .replace(/^Get together payout$/i, '') || '--';
      tr.innerHTML = `<td>${created}</td><td>${employeeName}</td><td>${role}</td><td>${gender}</td><td>${formatMoney(row.amount || 0)}</td><td>${remark}</td>`;
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    wrap.appendChild(tbl);
    listEl.appendChild(wrap);

    if (status) status.style.display = 'none';
  }

  $('loadGtHistory')?.addEventListener('click', loadGetTogetherHistory);
  $('gtMonth')?.addEventListener('change', loadGetTogetherHistory);

  function getTogetherHistoryToCsvRows(rows) {
    const header = ['Date', 'Employee', 'Role', 'Gender', 'Amount', 'Remark', 'Month'];
    const lines = [header.join(',')];
    (rows || []).forEach((row) => {
      const created = row.createdAt ? formatDate(row.createdAt) : '--';
      const employeeName = row.employee?.name || '--';
      const role = row.employee?.role || '--';
      const gender = row.employee?.gender || '--';
      const amount = Number(row.amount || 0);
      const remark = String(row.reason || '')
        .replace(/^Get together payout:\s*/i, '')
        .replace(/^Get together payout$/i, '');
      const cells = [
        escapeCsv(created),
        escapeCsv(employeeName),
        escapeCsv(role),
        escapeCsv(gender),
        escapeCsv(amount),
        escapeCsv(remark),
        escapeCsv(row.month || '')
      ];
      lines.push(cells.join(','));
    });
    return lines;
  }

  $('exportGtHistoryCsv')?.addEventListener('click', () => {
    if (!currentGetTogetherHistoryRows.length) {
      showToast('No payout history loaded');
      return;
    }
    const month = $('gtMonth')?.value || 'all';
    const rows = getTogetherHistoryToCsvRows(currentGetTogetherHistoryRows);
    downloadCsv(`get_together_payout_history_${month}.csv`, rows);
  });

  if ($('loadSummary')) $('loadSummary').addEventListener('click', loadRecordsSummary);
  if ($('recSumPrev')) $('recSumPrev').addEventListener('click', () => {
    if (summaryState.page > 1) {
      summaryState.page -= 1;
      renderSummaryTable();
    }
  });
  if ($('recSumNext')) $('recSumNext').addEventListener('click', () => {
    const maxPage = Math.max(1, Math.ceil(summaryState.records.length / summaryState.pageSize));
    if (summaryState.page < maxPage) {
      summaryState.page += 1;
      renderSummaryTable();
    }
  });

  const viewModal = $('recSummaryViewModal');
  const editModal = $('recSummaryEditModal');
  function openSummaryView(record) {
    currentSummaryRecord = record;
    const body = $('recSummaryViewBody');
    if (body) {
      const emp = record.employee?.name || record.employee || '--';
      const gender = record.employee?.gender || '--';
      const group = record.employee?.payroll_group || '--';
      body.textContent = `Payroll ID: ${record._id}\nEmployee: ${emp}\nGender: ${gender}\nGroup: ${group}\nMonth: ${record.month}\nGross: ${record.gross_salary}\nTotal deductions: ${record.total_deductions}\nNet: ${record.net_salary}\nBonuses: ${record.bonuses}\nWithheld: ${record.withheld_amount}\nCarryover savings: ${record.carryover_savings}\nCreated: ${formatDate(record.createdAt)}`;
    }
    if (viewModal) viewModal.setAttribute('aria-hidden', 'false');
  }
  function closeSummaryView() { if (viewModal) viewModal.setAttribute('aria-hidden', 'true'); }
  function openSummaryEdit(record) {
    currentSummaryRecord = record;
    if ($('recEditGross')) $('recEditGross').value = record.gross_salary ?? 0;
    if ($('recEditDeductions')) $('recEditDeductions').value = record.total_deductions ?? 0;
    if ($('recEditNet')) $('recEditNet').value = record.net_salary ?? 0;
    if ($('recEditBonuses')) $('recEditBonuses').value = record.bonuses ?? 0;
    if ($('recEditWithheld')) $('recEditWithheld').value = record.withheld_amount ?? 0;
    if ($('recEditCarry')) $('recEditCarry').value = record.carryover_savings ?? 0;
    if ($('recEditStatus')) $('recEditStatus').textContent = '';
    if (editModal) editModal.setAttribute('aria-hidden', 'false');
  }
  function closeSummaryEdit() { if (editModal) editModal.setAttribute('aria-hidden', 'true'); }

  if ($('recSummaryViewClose')) $('recSummaryViewClose').addEventListener('click', closeSummaryView);
  if ($('recSummaryEditClose')) $('recSummaryEditClose').addEventListener('click', closeSummaryEdit);
  if ($('recEditCancel')) $('recEditCancel').addEventListener('click', closeSummaryEdit);
  if (viewModal) viewModal.addEventListener('click', (e) => { if (e.target?.getAttribute('data-close') === 'true') closeSummaryView(); });
  if (editModal) editModal.addEventListener('click', (e) => { if (e.target?.getAttribute('data-close') === 'true') closeSummaryEdit(); });

  async function deleteSummaryRecord(record) {
    if (!record || !record._id) return;
    if (!confirm('Delete this payroll record?')) return;
    const r = await fetchJson(`/api/payroll/records/${record._id}`, { method: 'DELETE' });
    if (r.status === 200) {
      closeSummaryView();
      closeSummaryEdit();
      loadRecordsSummary();
    } else {
      showToast(r.body?.message || 'Delete failed');
    }
  }

  if ($('recSummaryViewDelete')) $('recSummaryViewDelete').addEventListener('click', () => deleteSummaryRecord(currentSummaryRecord));
  if ($('recSummaryViewEdit')) $('recSummaryViewEdit').addEventListener('click', () => openSummaryEdit(currentSummaryRecord));
  if ($('recSummaryViewRecalc')) $('recSummaryViewRecalc').addEventListener('click', async () => {
    if (!currentSummaryRecord) return;
    const employeeId = currentSummaryRecord.employee?._id || currentSummaryRecord.employee;
    const month = currentSummaryRecord.month;
    const r = await fetchJson('/api/payroll/generate/employee', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId, month, force: true })
    });
    if (r.status === 200) {
      showToast('Payroll recalculated');
      closeSummaryView();
      loadRecordsSummary();
    } else {
      const msg = r.body?.message || 'Recalculate failed';
      const statusEl = $('recSummaryViewStatus');
      if (statusEl) statusEl.textContent = msg;
    }
  });

  if ($('recSummaryEditForm')) {
    $('recSummaryEditForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentSummaryRecord) return;
      const payload = {
        gross_salary: parseFloat($('recEditGross').value),
        total_deductions: parseFloat($('recEditDeductions').value),
        net_salary: parseFloat($('recEditNet').value),
        bonuses: parseFloat($('recEditBonuses').value),
        withheld_amount: parseFloat($('recEditWithheld').value),
        carryover_savings: parseFloat($('recEditCarry').value)
      };
      const r = await fetchJson(`/api/payroll/records/${currentSummaryRecord._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (r.status === 200) {
        closeSummaryEdit();
        loadRecordsSummary();
      } else {
        const statusEl = $('recEditStatus');
        if (statusEl) statusEl.textContent = r.body?.message || 'Update failed';
      }
    });
  }

  // Deductions
  const dedEditModal = $('dedEditModal');
  const dedEditForm = $('dedEditForm');
  const dedEditClose = $('dedEditClose');
  const dedEditCancel = $('dedEditCancel');
  function openDedEditModal(deduction) {
    if (!dedEditModal || !dedEditForm) return;
    $('dedEditId').value = deduction._id;
    $('dedEditAmount').value = deduction.amount ?? '';
    $('dedEditReason').value = deduction.reason ?? '';
    $('dedEditValidation').textContent = '';
    $('dedEditAmountError').style.display = 'none';
    dedEditModal.setAttribute('aria-hidden', 'false');
  }
  function closeDedEditModal() {
    if (!dedEditModal) return;
    dedEditModal.setAttribute('aria-hidden', 'true');
  }
  function handleDedEditKeydown(e) {
    if (e.key === 'Escape' && dedEditModal && dedEditModal.getAttribute('aria-hidden') === 'false') {
      closeDedEditModal();
    }
  }
  if (dedEditClose) dedEditClose.addEventListener('click', closeDedEditModal);
  if (dedEditCancel) dedEditCancel.addEventListener('click', closeDedEditModal);
  document.addEventListener('keydown', handleDedEditKeydown);
  if (dedEditModal) {
    dedEditModal.addEventListener('click', (e) => {
      if (e.target && e.target.getAttribute('data-close') === 'true') closeDedEditModal();
    });
  }
  if ($('dedEditAmount')) {
    $('dedEditAmount').addEventListener('input', () => {
      const val = parseFloat($('dedEditAmount').value);
      const err = $('dedEditAmountError');
      if (!val || val <= 0) {
        err.textContent = 'Amount must be greater than 0.';
        err.style.display = 'block';
      } else {
        err.textContent = '';
        err.style.display = 'none';
      }
    });
  }
  if (dedEditForm) {
    dedEditForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = $('dedEditId').value;
      const amount = parseFloat($('dedEditAmount').value);
      const reason = $('dedEditReason').value;
      const validation = $('dedEditValidation');
      const amountError = $('dedEditAmountError');
      if (!id) { validation.textContent = 'Missing deduction id.'; return; }
      if (!amount || amount <= 0) {
        amountError.textContent = 'Amount must be greater than 0.';
        amountError.style.display = 'block';
        return;
      }
      amountError.textContent = '';
      amountError.style.display = 'none';
      const r = await fetchJson(`/api/payroll/deductions/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount, reason }) });
      if (r.status === 200) {
        showToast('Deduction updated');
        closeDedEditModal();
        loadDeductions();
      } else {
        validation.textContent = r.body?.message || 'Update failed';
      }
    });
  }
  const dedForm = document.getElementById('deductionsForm');
  if (dedForm) {
    dedForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const resolvedEmployee = resolveEmployeeFromInputs('dedEmployeeSelect', 'dedEmpName', 'dedEmpPhone');
      const employeeId = resolvedEmployee.employeeId;
      const type = $('dedType').value;
      const amount = parseFloat($('dedAmount').value);
      const month = $('dedMonth').value;
      const reason = $('dedReason').value;
      const validation = $('dedValidation');
      if (!employeeId) {
        validation.textContent = resolvedEmployee.error || 'Employee is required.';
        return;
      }
      if (!month) {
        validation.textContent = 'Month is required.';
        return;
      }
      if (!amount || amount <= 0) {
        validation.textContent = 'Amount must be greater than 0.';
        return;
      }
      validation.textContent = '';
      const r = await fetchJson('/api/payroll/deductions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId, type, amount, month, reason }) });
      if (r.status === 200) {
        showToast('Deduction created');
        loadDeductions();
      } else {
        validation.textContent = 'Error: ' + JSON.stringify(r.body);
      }
    });
  }
  $('loadDeds').addEventListener('click', () => loadDeductions());
  async function loadDeductions() {
    const selectedEmployeeId = $('dedEmployeeSelect')?.value || '';
    const url = selectedEmployeeId
      ? `/api/payroll/deductions?employeeId=${encodeURIComponent(selectedEmployeeId)}`
      : '/api/payroll/deductions';
    const r = await fetchJson(url);
    const container = $('dedList');
    const validation = $('dedValidation');
    if (r.status !== 200) { container.textContent = `Error: ${r.body.message || r.status}`; return; }
    container.innerHTML = '';
    const list = Array.isArray(r.body) ? r.body : (r.body && Array.isArray(r.body.data) ? r.body.data : []);
    if (validation) {
      validation.textContent = selectedEmployeeId
        ? 'Showing deduction history for selected employee.'
        : 'Showing deduction history for all employees.';
    }
    if (!Array.isArray(list) || list.length === 0) {
      container.textContent = selectedEmployeeId ? 'No deductions for selected employee' : 'No deductions';
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    const tbl = document.createElement('table');
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    ['Employee', 'Type', 'Amount', 'Month', 'Reason', 'Actions'].forEach(t => {
      const th = document.createElement('th'); th.textContent = t; headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    tbl.appendChild(thead);
    const tbody = document.createElement('tbody');
    list.forEach(d => {
      const tr = document.createElement('tr');
      const emp = d.employee && d.employee.name ? d.employee.name : (d.employee || '');
      tr.innerHTML = `<td>${emp}</td><td>${d.type}</td><td>${d.amount}</td><td>${d.month}</td><td>${d.reason || ''}</td>`;
      const actions = document.createElement('td');

      const editBtn = document.createElement('button');
      editBtn.className = 'icon-btn';
      editBtn.type = 'button';
      editBtn.setAttribute('aria-label', 'Edit deduction');
      editBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm18.71-11.04a1.003 1.003 0 0 0 0-1.42l-2.5-2.5a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.99-1.66z"/></svg>';
      editBtn.addEventListener('click', () => {
        openDedEditModal(d);
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn danger';
      delBtn.type = 'button';
      delBtn.setAttribute('aria-label', 'Delete deduction');
      delBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12l-1 14H7L6 7zm3-3h6l1 2H8l1-2z"/></svg>';
      delBtn.addEventListener('click', async () => {
        const rr = await fetchJson(`/api/payroll/deductions/${d._id}`, { method: 'DELETE' });
        if (rr.status === 200) { loadDeductions(); } else { alert('Delete failed'); }
      });

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      tr.appendChild(actions);
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    wrap.appendChild(tbl);
    container.appendChild(wrap);
  }

  async function loadDebtPayments() {
    const selectedEmployeeId = $('dedEmployeeSelect')?.value || '';
    const listEl = $('debtPaymentList');
    const summaryEl = $('debtSummary');
    if (!selectedEmployeeId) {
      if (summaryEl) summaryEl.textContent = 'Select an employee to view debt payment history.';
      if (listEl) listEl.textContent = 'No employee selected';
      return;
    }

    const r = await fetchJson(`/api/payroll/debts/payments?employeeId=${encodeURIComponent(selectedEmployeeId)}`);
    if (r.status !== 200) {
      if (listEl) listEl.textContent = `Error: ${r.body?.message || r.status}`;
      return;
    }

    const list = Array.isArray(r.body?.data) ? r.body.data : [];
    const summary = r.body?.summary;
    if (summaryEl && summary) {
      summaryEl.textContent = `Debt ${formatMoney(summary.total_debt)} • Paid ${formatMoney(summary.total_paid)} • Remaining ${formatMoney(summary.remaining_balance)}`;
    }

    if (!listEl) return;
    listEl.innerHTML = '';
    if (!list.length) {
      listEl.textContent = 'No debt payments recorded for selected employee.';
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    const tbl = document.createElement('table');
    const thead = document.createElement('thead');
    const row = document.createElement('tr');
    ['Employee', 'Amount Paid', 'Payment Date', 'Note'].forEach((title) => {
      const th = document.createElement('th');
      th.textContent = title;
      row.appendChild(th);
    });
    thead.appendChild(row);
    tbl.appendChild(thead);

    const tbody = document.createElement('tbody');
    list.forEach((payment) => {
      const tr = document.createElement('tr');
      const empName = payment.employee?.name || payment.employee || '--';
      const paymentDate = payment.payment_date ? new Date(payment.payment_date).toLocaleDateString() : '--';
      tr.innerHTML = `<td>${empName}</td><td>${formatMoney(payment.amount_paid)}</td><td>${paymentDate}</td><td>${payment.note || ''}</td>`;
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    wrap.appendChild(tbl);
    listEl.appendChild(wrap);
  }

  const debtPaymentForm = $('debtPaymentForm');
  if (debtPaymentForm) {
    debtPaymentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const employeeId = $('dedEmployeeSelect')?.value || '';
      const amountPaid = parseFloat($('debtPayAmount')?.value || '0');
      const paymentDate = $('debtPayDate')?.value || '';
      const note = $('debtPayNote')?.value || '';
      const validationEl = $('debtPayValidation');

      if (!employeeId) {
        if (validationEl) validationEl.textContent = 'Select an employee first.';
        return;
      }
      if (!amountPaid || amountPaid <= 0) {
        if (validationEl) validationEl.textContent = 'Amount paid must be greater than 0.';
        return;
      }
      if (!paymentDate) {
        if (validationEl) validationEl.textContent = 'Date of payment is required.';
        return;
      }
      if (validationEl) validationEl.textContent = '';

      const r = await fetchJson('/api/payroll/debts/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId,
          amount_paid: amountPaid,
          payment_date: paymentDate,
          note
        })
      });

      if (r.status === 200 || r.status === 201) {
        showToast('Debt payment recorded');
        debtPaymentForm.reset();
        await loadDebtPayments();
      } else if (validationEl) {
        validationEl.textContent = r.body?.message || 'Failed to record debt payment.';
      }
    });
  }

  if ($('loadDebtPayments')) $('loadDebtPayments').addEventListener('click', loadDebtPayments);

  // Savings
  $('loadSavings').addEventListener('click', () => loadSavings());

  async function payoutSavingsForFestival(festival) {
    const monthInput = $('savPayoutMonth');
    const statusEl = $('savPayoutStatus');
    const month = (monthInput && monthInput.value) ? monthInput.value : getCurrentMonth();
    if (monthInput && !monthInput.value) monthInput.value = month;

    const festivalLabel = festival === 'khmer_new_year' ? 'KNY' : 'Pchum Ben';
    const ok = window.confirm(`Run one-click savings payout for ${festivalLabel} (${month})?`);
    if (!ok) return;

    if (statusEl) statusEl.textContent = `Running ${festivalLabel} payout...`;
    const r = await fetchJson('/api/payroll/savings/payout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ festival, month })
    });

    if (r.status === 200) {
      const employeesPaid = Number(r.body?.employees_paid || 0);
      const totalPayout = Number(r.body?.total_payout || 0);
      if (statusEl) statusEl.textContent = `${festivalLabel} payout complete: ${employeesPaid} employee(s), total ${formatMoney(totalPayout)}.`;
      showToast(`${festivalLabel} payout completed`);
      await loadSavings();
    } else {
      if (statusEl) statusEl.textContent = r.body?.message || `Failed to run ${festivalLabel} payout.`;
    }
  }

  if ($('payoutKny')) $('payoutKny').addEventListener('click', () => payoutSavingsForFestival('khmer_new_year'));
  if ($('payoutPchum')) $('payoutPchum').addEventListener('click', () => payoutSavingsForFestival('pchum_ben'));
  if ($('savPayoutMonth') && !$('savPayoutMonth').value) $('savPayoutMonth').value = getCurrentMonth();

  async function loadSavings() {
    const r = await fetchJson('/api/payroll/savings');
    const container = $('savingsList');
    const summary = $('savingsSummary');
    if (r.status !== 200) { container.textContent = `Error: ${r.body.message || r.status}`; return; }
    container.innerHTML = '';
    if (summary) summary.innerHTML = '';
    if (!Array.isArray(r.body) || r.body.length === 0) { container.textContent = 'No savings'; return; }

    const totalEmployees = r.body.length;
    const totalMonthly = r.body.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
    const totalAccum = r.body.reduce((sum, s) => sum + (parseFloat(s.accumulated_total) || 0), 0);
    if (summary) {
      summary.innerHTML = `
        <div class="summary-card"><div class="label">Employees</div><div class="value">${totalEmployees}</div></div>
        <div class="summary-card"><div class="label">Monthly Total</div><div class="value">${totalMonthly.toFixed(2)}</div></div>
        <div class="summary-card"><div class="label">Accumulated Total</div><div class="value">${totalAccum.toFixed(2)}</div></div>
      `;
    }

    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    const tbl = document.createElement('table');
    const thead = document.createElement('thead');
    const h = document.createElement('tr');
    ['Employee','Amount','Accumulated','Actions'].forEach(t => { const th = document.createElement('th'); th.textContent = t; h.appendChild(th); });
    thead.appendChild(h);
    tbl.appendChild(thead);
    const tbody = document.createElement('tbody');
    r.body.forEach(s => {
      const tr = document.createElement('tr');
      const emp = s.employee ? s.employee.name : (s.employee || '');
      tr.innerHTML = `<td>${emp}</td><td>${s.amount}</td><td>${s.accumulated_total}</td>`;
      const updBtn = document.createElement('button');
      updBtn.textContent = 'Update';
      updBtn.addEventListener('click', async () => {
        const newAmount = parseFloat(prompt('Amount', s.amount));
        const reset = confirm('Reset accumulated total?');
        const rr = await fetchJson(`/api/payroll/savings/${s.employee._id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: newAmount, resetAccumulated: reset }) });
        if (rr.status === 200) { loadSavings(); } else { alert('Update failed'); }
      });
      const td = document.createElement('td');
      td.appendChild(updBtn);
      tr.appendChild(td);
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    wrap.appendChild(tbl);
    container.appendChild(wrap);
  }

  // Run employee payroll
  let runPreviewTimer;

  function formatMoney(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '--';
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function amountHtml(value, kind) {
    const num = Number(value);
    const formatted = formatMoney(value);
    let cls = 'amount-neutral';

    if (kind === 'revenue') cls = 'amount-revenue';
    if (kind === 'profit') cls = num > 0 ? 'amount-profit' : 'amount-owe';
    if (kind === 'hold') cls = num > 0 ? 'amount-hold' : 'amount-neutral';
    if (kind === 'owe') cls = num > 0 ? 'amount-owe' : 'amount-neutral';

    return `<span class="run-amount ${cls}">${escapeHtml(formatted)}</span>`;
  }

  function getRunEmployeeContext() {
    const selectEl = $('runEmployeeSelect');
    const selectedId = selectEl ? selectEl.value : '';
    if (selectedId) {
      const matched = allEmployees.find((employee) => String(employee._id) === String(selectedId));
      const selectedLabel = selectEl && selectEl.selectedOptions[0]
        ? selectEl.selectedOptions[0].textContent
        : (matched?.name || 'Selected employee');
      return { employeeId: selectedId, label: selectedLabel };
    }

    const name = ($('runEmpName')?.value || '').trim().toLowerCase();
    const phone = ($('runEmpPhone')?.value || '').trim().toLowerCase();
    if (!name && !phone) return { employeeId: '', label: 'Select employee' };

    const matches = allEmployees.filter((employee) => {
      const employeeName = (employee.name || '').toLowerCase();
      const employeePhone = (employee.phone || '').toLowerCase();
      const nameMatch = !name || employeeName.includes(name);
      const phoneMatch = !phone || employeePhone.includes(phone);
      return nameMatch && phoneMatch;
    });

    if (matches.length === 1) {
      const employee = matches[0];
      const phoneLabel = employee.phone ? ` (${employee.phone})` : '';
      return { employeeId: employee._id, label: `${employee.name || 'Employee'}${phoneLabel}` };
    }
    if (matches.length > 1) return { employeeId: '', label: 'Multiple matches - pick from dropdown' };
    return { employeeId: '', label: 'No employee match' };
  }

  function formatRunResult(record, employeeLabel) {
    const deductions = Array.isArray(record?.deductions) ? record.deductions : [];
    const employeeText = employeeLabel || record?.employee || '--';
    const monthText = record?.month || '--';

    let deductionsHtml = '<div class="run-row"><span class="run-label">Applied deductions:</span> none</div>';
    if (deductions.length > 0) {
      deductionsHtml = `
        <div class="run-row"><span class="run-label">Applied deductions:</span></div>
        <ul class="run-deductions">
          ${deductions.map((deduction) => {
            const amount = amountHtml(deduction.amount, 'owe');
            const dedType = escapeHtml(deduction.type || 'deduction');
            const reason = deduction.reason ? ` <span class="run-note">(${escapeHtml(deduction.reason)})</span>` : '';
            return `<li><span class="run-ded-type">${dedType}</span>: ${amount}${reason}</li>`;
          }).join('')}
        </ul>
      `;
    }

    return `
      <div class="run-result success">
        <div class="run-title">Payroll generated successfully.</div>
        <div class="run-row run-note">Salary breakdown (rounded to 2 decimals)</div>
        <div class="run-row"><span class="run-label">Employee:</span> <strong class="run-employee">${escapeHtml(employeeText)}</strong></div>
        <div class="run-row"><span class="run-label">Month:</span> ${escapeHtml(monthText)}</div>
        <div class="run-row"><span class="run-label">Gross salary:</span> ${amountHtml(record?.gross_salary, 'revenue')}</div>
        <div class="run-row"><span class="run-label">Total deductions:</span> ${amountHtml(record?.total_deductions, 'owe')}</div>
        <div class="run-row"><span class="run-label">Net salary:</span> ${amountHtml(record?.net_salary, 'profit')}</div>
        <div class="run-row"><span class="run-label">Bonuses:</span> ${amountHtml(record?.bonuses, 'profit')}</div>
        <div class="run-row"><span class="run-label">Withheld amount:</span> ${amountHtml(record?.withheld_amount, 'hold')}</div>
        <div class="run-row"><span class="run-label">Carryover savings:</span> ${amountHtml(record?.carryover_savings, 'hold')}</div>
        ${deductionsHtml}
      </div>
    `;
  }

  async function updateRunPreview() {
    const month = $('runMonth').value;
    const preview = $('runPreview');
    if (!preview) return;
    const context = getRunEmployeeContext();
    const employeeId = context.employeeId;
    const empName = context.label;
    preview.innerHTML = `
      <div><strong>Preview</strong>: ${escapeHtml(empName)} • ${escapeHtml(month || 'Select month')}</div>
      <div>Gross: -- • Total deductions: -- • Net: --</div>
      <div class="run-note">Rounding: amounts are displayed to 2 decimals.</div>
      <div class="run-note">Deduction explanation: no payroll record found yet for this month.</div>
    `;
    if (!employeeId || !month) return;
    clearTimeout(runPreviewTimer);
    runPreviewTimer = setTimeout(async () => {
      const r = await fetchJson(`/api/payroll/records?month=${encodeURIComponent(month)}`);
      if (r.status !== 200 || !Array.isArray(r.body)) return;
      const match = r.body.find(rec => rec.employee && rec.employee._id === employeeId);
      if (!match) return;
      const deductions = Array.isArray(match.deductions) ? match.deductions : [];
      const explanation = deductions.length
        ? deductions.map((deduction) => `${deduction.type || 'deduction'} ${formatMoney(deduction.amount)}${deduction.reason ? ` (${deduction.reason})` : ''}`).join('; ')
        : 'None';
      preview.innerHTML = `
        <div><strong>Preview</strong>: ${escapeHtml(empName)} • ${escapeHtml(month)}</div>
        <div>Gross: ${escapeHtml(formatMoney(match.gross_salary))} • Total deductions: ${escapeHtml(formatMoney(match.total_deductions))} • Net: ${escapeHtml(formatMoney(match.net_salary))}</div>
        <div class="run-note">Rounding: amounts are displayed to 2 decimals.</div>
        <div class="run-note">Deduction explanation: ${escapeHtml(explanation)}</div>
      `;
    }, 250);
  }
  $('runEmployeeSelect').addEventListener('change', updateRunPreview);
  $('runEmpName')?.addEventListener('input', updateRunPreview);
  $('runEmpPhone')?.addEventListener('input', updateRunPreview);
  $('runMonth').addEventListener('change', updateRunPreview);
  const forceToggle = $('runForce');
  const forceWarning = $('runForceWarning');
  const zeroAbsenceBonusToggle = $('runZeroAbsenceBonusEnabled');
  const zeroAbsenceBonusAmountInput = $('runZeroAbsenceBonusAmount');
  if (forceToggle && forceWarning) {
    forceToggle.addEventListener('change', () => {
      forceWarning.style.display = forceToggle.checked ? 'block' : 'none';
    });
  }
  if (zeroAbsenceBonusToggle && zeroAbsenceBonusAmountInput) {
    zeroAbsenceBonusToggle.addEventListener('change', () => {
      zeroAbsenceBonusAmountInput.disabled = !zeroAbsenceBonusToggle.checked;
      if (!zeroAbsenceBonusToggle.checked) zeroAbsenceBonusAmountInput.value = '0';
      if (zeroAbsenceBonusToggle.checked && (!zeroAbsenceBonusAmountInput.value || Number(zeroAbsenceBonusAmountInput.value) <= 0)) {
        zeroAbsenceBonusAmountInput.value = '10';
      }
    });
  }
  const runForm = document.getElementById('runPayrollForm');
  if (runForm) {
    runForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const resolvedEmployee = resolveEmployeeFromInputs('runEmployeeSelect', 'runEmpName', 'runEmpPhone');
      const employeeId = resolvedEmployee.employeeId;
      const month = $('runMonth').value;
      const idemp = $('runIdemp').value.trim();
      const force = $('runForce').checked;
      const zero_absence_bonus_enabled = !!$('runZeroAbsenceBonusEnabled')?.checked;
      const zero_absence_bonus_amount = parseFloat($('runZeroAbsenceBonusAmount')?.value || '0') || 0;
      const validation = $('runValidation');
      if (force) {
        const ok = window.confirm('Force run will overwrite existing payroll for this month. Continue?');
        if (!ok) return;
      }
      if (!employeeId) {
        validation.textContent = resolvedEmployee.error || 'Employee is required.';
        return;
      }
      if (!month) {
        validation.textContent = 'Month is required.';
        return;
      }
      if (zero_absence_bonus_enabled && zero_absence_bonus_amount <= 0) {
        validation.textContent = 'Enter a bonus amount greater than 0 when zero-absence bonus is enabled.';
        return;
      }
      validation.textContent = '';
      const headers = { 'Content-Type': 'application/json' };
      if (idemp) headers['Idempotency-Key'] = idemp;
      const r = await fetchJson('/api/payroll/generate/employee', {
        method: 'POST',
        headers,
        body: JSON.stringify({ employeeId, month, force, idempotencyKey: idemp, zero_absence_bonus_enabled, zero_absence_bonus_amount })
      });
      const el = $('runResp');
      if (r.status === 200) {
        const record = r.body.payrollRecord || r.body;
        const employeeLabel = $('runEmployeeSelect')?.selectedOptions[0]?.textContent || $('runEmpName')?.value || String(record?.employee || 'Employee');
        el.innerHTML = formatRunResult(record, employeeLabel);
        showToast('Payroll generated');
        updateRunPreview();
      } else {
        const message = r.body?.message || 'Unable to run payroll.';
        el.innerHTML = `
          <div class="run-result error">
            <div class="run-title">Could not run payroll.</div>
            <div class="run-row"><span class="run-label">Reason:</span> ${escapeHtml(message)}</div>
          </div>
        `;
      }
    });
  }

  // Scheduler / Automatic payroll
  function getSelectedScheduleExpression() {
    const preset = $('schedPreset')?.value;
    if (!preset || preset === 'custom') {
      return ($('schedExpr')?.value || '').trim();
    }
    return preset;
  }

  function syncSchedulePresetUi() {
    const preset = $('schedPreset')?.value;
    const cronInput = $('schedExpr');
    if (!cronInput) return;
    if (!preset || preset === 'custom') {
      cronInput.disabled = false;
      return;
    }
    cronInput.value = preset;
    cronInput.disabled = true;
  }

  function setSchedStatus(label, isRunning) {
    const badge = $('schedStatus');
    if (!badge) return;
    badge.textContent = label;
    badge.classList.remove('running', 'stopped');
    if (isRunning === true) badge.classList.add('running');
    if (isRunning === false) badge.classList.add('stopped');
    const startBtn = $('startSched');
    const stopBtn = $('stopSched');
    if (startBtn && stopBtn && isRunning !== null) {
      startBtn.disabled = isRunning === true;
      stopBtn.disabled = isRunning === false;
    }
  }
  $('schedPreset')?.addEventListener('change', syncSchedulePresetUi);

  $('startSched').addEventListener('click', async () => {
    const payroll_group = $('schedGroup').value;
    const cronExpression = getSelectedScheduleExpression();
    if (!cronExpression) {
      $('schedMsg').textContent = 'Please choose a schedule.';
      return;
    }
    const r = await fetchJson('/api/payroll/schedule/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payroll_group, cronExpression }) });
    if (r.status === 200) {
      $('schedMsg').textContent = `Automation is ON for ${payroll_group}.`;
      setSchedStatus('On', true);
    } else {
      $('schedMsg').textContent = `Error: ${r.body.message || r.status}`;
    }
  });
  $('stopSched').addEventListener('click', async () => {
    const payroll_group = $('schedGroup').value;
    const ok = window.confirm('Stop the scheduler for this group?');
    if (!ok) return;
    const r = await fetchJson('/api/payroll/schedule/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payroll_group }) });
    if (r.status === 200) {
      $('schedMsg').textContent = `Automation is OFF for ${payroll_group}.`;
      setSchedStatus('Off', false);
    } else {
      $('schedMsg').textContent = `Error: ${r.body.message || r.status}`;
    }
  });
  $('statusSched').addEventListener('click', async () => {
    const payroll_group = $('schedGroup').value;
    const r = await fetchJson(`/api/payroll/schedule?payroll_group=${encodeURIComponent(payroll_group)}`);
    if (r.status === 200) {
      const running = typeof r.body?.running === 'boolean' ? r.body.running : null;
      $('schedMsg').textContent = running === null
        ? 'Unable to determine automation status.'
        : `Automation is ${running ? 'ON' : 'OFF'} for ${payroll_group}.`;
      if (running !== null) setSchedStatus(running ? 'On' : 'Off', running);
    } else {
      $('schedMsg').textContent = `Error: ${r.body.message || r.status}`;
    }
  });

  // Initialize scheduler status controls
  syncSchedulePresetUi();
  setSchedStatus('Unknown', null);


  // Add Employee
  function setupEmployeeAddPage() {
    const form = document.getElementById('employeeAddForm');
    if (!form) return;
    const msg = document.getElementById('empAddMsg');
    const saveBtn = document.getElementById('empSaveBtn');
    const clearBtn = document.getElementById('empClearBtn');
    const groupSelect = document.getElementById('empPayrollGroup');
    const allowGroupMix = document.getElementById('empAllowGroupMix');
    const groupWarn = document.getElementById('empGroupWarn');
    const has20El = document.getElementById('empHas20');
    const has10HoldEl = document.getElementById('empHas10Hold');
    const hasDebtEl = document.getElementById('empHasDebt');
    const roleEl = document.getElementById('empRole');
    const workerTagEl = document.getElementById('empWorkerTag');
    const mealModeEl = document.getElementById('empMealMode');
    const payCycleDayEl = document.getElementById('empPayCycleDay');

    function syncRoleDependentFields() {
      const role = String(roleEl?.value || 'employee').trim().toLowerCase();
      const isWorker = role === 'worker';
      const isManager = role === 'manager';

      if (workerTagEl) {
        workerTagEl.disabled = !isWorker;
        if (!isWorker) workerTagEl.value = '';
        if (isWorker && !workerTagEl.value) workerTagEl.value = 'worker';
      }

      if (mealModeEl) {
        mealModeEl.disabled = !isWorker;
        if (!isWorker) mealModeEl.value = '';
      }

      if (payCycleDayEl) {
        payCycleDayEl.value = isManager ? '1' : '20';
      }
    }

    function getGroupAvailability() {
      const has20 = !!(has20El && has20El.checked);
      const has10Hold = !!(has10HoldEl && has10HoldEl.checked);
      const hasDebt = !!(hasDebtEl && hasDebtEl.checked);

      const availability = {
        cut: { enabled: true, reason: '' },
        'no-cut': { enabled: true, reason: '' },
        monthly: { enabled: true, reason: '' }
      };

      if (has20 || has10Hold) {
        availability['no-cut'] = {
          enabled: false,
          reason: 'Disabled: no-cut does not apply $20 deduction or 10-day holding profiles.'
        };
      }

      if (hasDebt) {
        availability.cut = {
          enabled: false,
          reason: 'Disabled: debt-deduction profile uses monthly group payroll behavior.'
        };
        availability['no-cut'] = {
          enabled: false,
          reason: 'Disabled: debt-deduction profile uses monthly group payroll behavior.'
        };
      }

      let suggested = 'no-cut';
      if (hasDebt) suggested = 'monthly';
      else if (has20 || has10Hold) suggested = 'cut';

      if (!availability[suggested] || !availability[suggested].enabled) {
        const fallback = Object.keys(availability).find((group) => availability[group].enabled);
        suggested = fallback || '';
      }

      return { availability, suggested };
    }

    function updateGroupUiFromConditions() {
      if (!groupSelect) return;
      const { availability, suggested } = getGroupAvailability();
      const allowMulti = !!(allowGroupMix && allowGroupMix.checked);
      const warnings = [];

      if (allowMulti) {
        groupSelect.setAttribute('multiple', 'multiple');
        groupSelect.removeAttribute('required');
      } else {
        groupSelect.removeAttribute('multiple');
      }

      Array.from(groupSelect.options).forEach((opt) => {
        if (!opt.value) return;
        const groupState = availability[opt.value] || { enabled: true, reason: '' };
        opt.disabled = !groupState.enabled;
        opt.title = groupState.reason || '';
        if (opt.disabled) {
          warnings.push(`${opt.value}: ${groupState.reason}`);
          opt.selected = false;
        }
      });

      if (!allowMulti) {
        if (!groupSelect.value || (availability[groupSelect.value] && !availability[groupSelect.value].enabled)) {
          groupSelect.value = suggested || '';
        }
      }

      const warningText = warnings.join(' | ');
      groupSelect.title = warningText || 'Select payroll group';

      if (groupWarn) {
        groupWarn.classList.add('group-warning-inline');
        groupWarn.textContent = warningText;
        groupWarn.style.display = 'none';
      }
    }

    function getSelectedGroups() {
      if (!groupSelect) return [];
      if (groupSelect.hasAttribute('multiple')) {
        return Array.from(groupSelect.selectedOptions).map((o) => o.value).filter(Boolean);
      }
      return groupSelect.value ? [groupSelect.value] : [];
    }

    function resolvePayrollGroupForSubmit() {
      const selectedGroups = getSelectedGroups();
      const { availability, suggested } = getGroupAvailability();

      const enabledSelected = selectedGroups.filter((group) => availability[group] && availability[group].enabled);

      if (enabledSelected.length === 1) return enabledSelected[0];
      if (enabledSelected.length > 1) return suggested || enabledSelected[0];
      if (suggested) return suggested;

      const firstEnabled = Object.keys(availability).find((group) => availability[group].enabled);
      return firstEnabled || '';
    }

    const clear = () => {
      form.reset();
      // reset checkboxes default
      const active = document.getElementById('empActive');
      if (active) active.checked = true;
      if (allowGroupMix) allowGroupMix.checked = false;
      updateGroupUiFromConditions();
      syncRoleDependentFields();
      if (msg) msg.textContent = '';
    };

    if (clearBtn) clearBtn.onclick = clear;

    if (allowGroupMix) {
      allowGroupMix.addEventListener('change', () => {
        updateGroupUiFromConditions();
      });
    }

    if (roleEl) {
      roleEl.addEventListener('change', syncRoleDependentFields);
    }

    [has20El, has10HoldEl, hasDebtEl].forEach((el) => {
      if (el) {
        el.addEventListener('change', () => {
          updateGroupUiFromConditions();
        });
      }
    });

    if (groupSelect && groupWarn) {
      groupSelect.addEventListener('mouseenter', () => {
        if (groupWarn.textContent) groupWarn.style.display = 'block';
      });
      groupSelect.addEventListener('focus', () => {
        if (groupWarn.textContent) groupWarn.style.display = 'block';
      });
      groupSelect.addEventListener('mouseleave', () => {
        groupWarn.style.display = 'none';
      });
      groupSelect.addEventListener('blur', () => {
        groupWarn.style.display = 'none';
      });
    }

    updateGroupUiFromConditions();
    syncRoleDependentFields();

    form.onsubmit = async (e) => {
      e.preventDefault();
      if (msg) msg.textContent = '';
      saveBtn.disabled = true;

      const selectedGroups = getSelectedGroups();
      const resolvedPayrollGroup = resolvePayrollGroupForSubmit();

      const payload = {
        name: document.getElementById('empName').value.trim(),
        phone: document.getElementById('empPhone').value.trim(),
        gender: String(document.getElementById('empGender')?.value || '').trim().toLowerCase(),
        role: String(document.getElementById('empRole')?.value || '').trim().toLowerCase(),
        worker_tag: String(document.getElementById('empWorkerTag')?.value || '').trim().toLowerCase(),
        meal_mode: String(document.getElementById('empMealMode')?.value || '').trim().toLowerCase(),
        pay_cycle_day: Number(document.getElementById('empPayCycleDay')?.value || '20'),
        base_salary: Number(document.getElementById('empBaseSalary').value),
        payroll_group: resolvedPayrollGroup,
        start_date: document.getElementById('empStartDate').value || undefined,
        active: !!document.getElementById('empActive').checked,
        has_20_deduction: !!document.getElementById('empHas20').checked,
        has_10day_holding: !!document.getElementById('empHas10Hold').checked,
        has_debt_deduction: !!document.getElementById('empHasDebt').checked
      };

      if (!payload.name || !payload.payroll_group || Number.isNaN(payload.base_salary) || !['male', 'female'].includes(payload.gender)) {
        if (msg) msg.textContent = 'Name, gender, payroll group, and base salary are required.';
        saveBtn.disabled = false;
        return;
      }

      if (!['employee', 'worker', 'manager', 'car_driver', 'tuk_tuk_driver'].includes(payload.role)) {
        if (msg) msg.textContent = 'Role is required.';
        saveBtn.disabled = false;
        return;
      }

      if (![1, 20].includes(payload.pay_cycle_day)) {
        if (msg) msg.textContent = 'Pay cycle day must be 1 or 20.';
        saveBtn.disabled = false;
        return;
      }

      if (msg && selectedGroups.length !== 1) {
        msg.textContent = `Payroll group auto-resolved to "${payload.payroll_group}" from selected conditions.`;
      }

      const r = await fetchJson('/api/payroll/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      saveBtn.disabled = false;

      if (r.status === 200 || r.status === 201) {
        showToast('Employee created');
        clear();
        // refresh cached employees for the rest of the app
        loadEmployees();
      } else {
        if (msg) msg.textContent = r.body && r.body.message ? r.body.message : ('Error: ' + r.status);
      }
    };
  }


  // routing
  function init() { showRoute(); loadEmployees(); refreshMe(); }

  // start
  init();
})();