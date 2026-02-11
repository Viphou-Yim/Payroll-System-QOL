(function(){
  const API = window.API_BASE || '';
  async function fetchJson(url, options = {}) {
    options.headers = options.headers || {};
    options.credentials = 'include'; // send cookies for session auth
    const res = await fetch((url.startsWith('http') ? url : API + url), options);
    const body = await res.json().catch(()=> ({}));
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

  function createEmployeeOption(e) {
    const opt = document.createElement('option');
    opt.value = e._id;
    const phone = e.phone ? ` (${e.phone})` : '';
    opt.textContent = `${e.name}${phone} - ${e.payroll_group}`;
    return opt;
  }

  function filterAndPopulateSelect(selectId, firstName = '', lastName = '', phone = '') {
    const sel = $(selectId);
    if (!sel) return;
    sel.innerHTML = '<option value="">Select employee...</option>';
    
    const filtered = allEmployees.filter(e => {
      const nameLower = (e.name || '').toLowerCase();
      const phoneLower = (e.phone || '').toLowerCase();
      const firstMatch = firstName.length === 0 || nameLower.includes(firstName.toLowerCase());
      const lastMatch = lastName.length === 0 || nameLower.includes(lastName.toLowerCase());
      const phoneMatch = phone.length === 0 || phoneLower.includes(phone.toLowerCase());
      return firstMatch && lastMatch && phoneMatch;
    });

    filtered.forEach(e => sel.appendChild(createEmployeeOption(e)));
  }

  function setupEmployeeSearch(selectId, firstId, lastId, phoneId) {
    const firstInput = $(firstId);
    const lastInput = $(lastId);
    const phoneInput = $(phoneId);
    
    if (!firstInput || !lastInput || !phoneInput) return;
    
    const updateFilter = () => {
      const first = firstInput.value;
      const last = lastInput.value;
      const phone = phoneInput.value;
      filterAndPopulateSelect(selectId, first, last, phone);
    };
    
    firstInput.addEventListener('input', updateFilter);
    lastInput.addEventListener('input', updateFilter);
    phoneInput.addEventListener('input', updateFilter);
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
    
    // Populate attendance employee
    sel.innerHTML = '';
    allEmployees.forEach(e => sel.appendChild(createEmployeeOption(e)));
    setupEmployeeSearch('employeeSelect', 'attEmpFirst', 'attEmpLast', 'attEmpPhone');
    
    // Populate run payroll employee
    runSel.innerHTML = '';
    allEmployees.forEach(e => runSel.appendChild(createEmployeeOption(e)));
    setupEmployeeSearch('runEmployeeSelect', 'runEmpFirst', 'runEmpLast', 'runEmpPhone');
    
    // Populate deductions employee
    dedSel.innerHTML = '';
    allEmployees.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e._id;
      const phone = e.phone ? ` (${e.phone})` : '';
      opt.textContent = `${e.name}${phone}`;
      dedSel.appendChild(opt);
    });
    setupEmployeeSearch('dedEmployeeSelect', 'dedEmpFirst', 'dedEmpLast', 'dedEmpPhone');
    
    if (typeof updateRunPreview === 'function') updateRunPreview();
  }

  // Inline validation and improved form UX for Attendance
  const attForm = document.getElementById('attendanceForm');
  if (attForm) {
    attForm.addEventListener('input', () => {
      const daysWorked = parseInt(attForm.attDays.value, 10) || 0;
      const daysAbsent = parseInt(attForm.attAbsent.value, 10) || 0;
      const month = attForm.attMonth.value;
      let maxDays = 31;
      if (month) {
        const [y, m] = month.split('-');
        maxDays = new Date(y, m, 0).getDate();
      }
      const totalDaysEl = document.getElementById('attTotalDays');
      if (totalDaysEl) totalDaysEl.textContent = `Total days in month: ${maxDays}`;
      let msg = '';
      if (daysWorked + daysAbsent > maxDays) msg = `Days worked + absent (${daysWorked + daysAbsent}) exceeds days in month (${maxDays})`;
      if (daysWorked < 0 || daysAbsent < 0) msg = 'Days must be ≥ 0';
      attForm.attDays.setCustomValidity(msg);
      attForm.attAbsent.setCustomValidity(msg);
      document.getElementById('attValidation').textContent = msg;
    });
    attForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const employeeId = attForm.employeeSelect.value;
      const month = attForm.attMonth.value;
      const days_worked = parseInt(attForm.attDays.value, 10);
      const days_absent = parseInt(attForm.attAbsent.value, 10);
      const validation = document.getElementById('attValidation');
      if (attForm.attDays.validity.customError || attForm.attAbsent.validity.customError) {
        validation.textContent = attForm.attDays.validationMessage || attForm.attAbsent.validationMessage;
        return;
      }
      const r = await fetchJson('/api/payroll/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId, month, days_worked, days_absent }) });
      if (r.status === 200) {
        document.getElementById('attMsg').textContent = '';
        showToast('Attendance saved');
      } else {
        document.getElementById('attMsg').textContent = `Error: ${JSON.stringify(r.body) || r.status}`;
      }
    });
  }

  let currentRecords = [];
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
  function downloadCsv(filename, rows) { const csv = rows.join('\n'); const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 1000); }
  function recordsToCsvRows(records) { const header = ['Employee','EmployeeId','Month','Gross','TotalDeductions','Net','Withheld','CarryoverSavings','Bonuses','DeductionsJSON']; const rows = [header.join(',')]; for (const r of records) { const emp = r.employee ? r.employee.name : (r.employee || ''); const empId = r.employee && r.employee._id ? r.employee._id : (r.employee || ''); const deductionsJson = JSON.stringify(r.deductions || []); const row = [escapeCsv(emp), escapeCsv(empId), escapeCsv(r.month), escapeCsv(r.gross_salary), escapeCsv(r.total_deductions), escapeCsv(r.net_salary), escapeCsv(r.withheld_amount), escapeCsv(r.carryover_savings), escapeCsv(r.bonuses), escapeCsv(deductionsJson)]; rows.push(row.join(',')); } return rows; }
  function showRecordDetails(rec) { const d = $('recordDetails'); d.style.display = 'block'; const emp = rec.employee ? `${rec.employee.name} (${rec.employee._id})` : (rec.employee || ''); d.textContent = `Employee: ${emp}\nMonth: ${rec.month}\nGross: ${rec.gross_salary}\nTotal deductions: ${rec.total_deductions}\nNet: ${rec.net_salary}\nWithheld: ${rec.withheld_amount}\nCarryover savings: ${rec.carryover_savings}\nBonuses: ${JSON.stringify(rec.bonuses, null, 2)}\nDeductions: ${JSON.stringify(rec.deductions, null, 2)}`;
    const btnId = 'exportRecBtn'; if (!document.getElementById(btnId)) { const btn = document.createElement('button'); btn.id = btnId; btn.textContent = 'Export This Record CSV'; btn.addEventListener('click', () => { const rows = recordsToCsvRows([rec]); downloadCsv(`payroll_${rec.employee && rec.employee._id ? rec.employee._id : 'record'}_${rec.month}.csv`, rows); }); d.appendChild(document.createElement('div')).appendChild(btn); }
  }

  $('loadRecords').addEventListener('click', () => { renderRecords(); });

  function renderRecordsTable(records) {
    const container = $('recordsList');
    container.innerHTML = '';
    if (!Array.isArray(records) || records.length === 0) { container.textContent = 'No records found'; return; }
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    const tbl = document.createElement('table');
    const thead = document.createElement('thead');
    const h = document.createElement('tr');
    ['Employee','Month','Gross','Deductions','Net','Actions'].forEach(t => { const th = document.createElement('th'); th.textContent = t; h.appendChild(th); });
    thead.appendChild(h);
    tbl.appendChild(thead);
    const tbody = document.createElement('tbody');
    records.forEach(rec => {
      const tr = document.createElement('tr'); const emp = rec.employee ? rec.employee.name : (rec.employee || ''); const viewBtn = `<button class="viewBtn">View</button>`;
      tr.innerHTML = `<td>${emp}</td><td>${rec.month}</td><td>${rec.gross_salary}</td><td>${rec.total_deductions}</td><td>${rec.net_salary}</td><td>${viewBtn}</td>`;
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

  $('exportCsv').addEventListener('click', () => {
    if (!currentRecords || currentRecords.length === 0) { alert('No records loaded'); return; }
    const month = $('recMonth').value || new Date().toISOString().slice(0,7);
    const rows = recordsToCsvRows(filterRecords(currentRecords));
    downloadCsv(`payroll_records_${month}.csv`, rows);
  });

  $('exportServerCsv').addEventListener('click', async () => {
    const month = $('recMonth').value;
    if (!month) { alert('Please enter a month (YYYY-MM)'); return; }
    const resp = await fetchJson(`/api/payroll/export?month=${encodeURIComponent(month)}`);
    if (!resp.res.ok) { alert('Export failed: ' + (resp.body.message || resp.status)); return; }
    const blob = await resp.res.blob();
    const filename = resp.res.headers.get('content-disposition')?.match(/filename="?(.*?)"?$/)?.[1] || `payroll_${month}.csv`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  });

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
    const r = await fetchJson('/api/auth/me');
    if (r.status === 200) {
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
    } else {
      $('loginStatus').textContent = 'Logout failed';
    }
  });

  function showRoute() {
    const rawHash = (window.location.hash || '').replace('#','');
    const authed = window.__authLoggedIn === true;
    let route = rawHash || (authed ? 'attendance' : 'login');
    if (!authed && route !== 'login' && route !== 'signup') route = 'login';
    if (authed && (route === 'login' || route === 'signup')) route = 'attendance';
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
    if (route === 'attendance') { loadEmployees(); }
    if (route === 'records') { renderRecords(); }
    if (route === 'records-summary') { loadRecordsSummary(); }
    if (route === 'run') { loadEmployees(); }
    if (route === 'deductions') { loadDeductions(); loadEmployees(); }
    if (route === 'savings') { loadSavings(); }
    if (route === 'login') { setupLoginPage(); }
    if (route === 'signup') { setupSignupPage(); }
    if (route === 'account') { setupAccountPage(); }
  }

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
        status.textContent = '';
        window.location.hash = '#attendance';
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
      td.colSpan = 8;
      td.textContent = 'No records found.';
      tr.appendChild(td);
      recSumBody.appendChild(tr);
      return;
    }
    slice.forEach(r => {
      const tr = document.createElement('tr');
      const empName = r.employee?.name || r.employee || '--';
      const group = r.employee?.payroll_group || '--';
      tr.innerHTML = `
        <td>${r._id || '--'}</td>
        <td>${empName}</td>
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
      const group = record.employee?.payroll_group || '--';
      body.textContent = `Payroll ID: ${record._id}\nEmployee: ${emp}\nGroup: ${group}\nMonth: ${record.month}\nGross: ${record.gross_salary}\nTotal deductions: ${record.total_deductions}\nNet: ${record.net_salary}\nBonuses: ${record.bonuses}\nWithheld: ${record.withheld_amount}\nCarryover savings: ${record.carryover_savings}\nCreated: ${formatDate(record.createdAt)}`;
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
      const employeeId = $('dedEmployeeSelect').value;
      const type = $('dedType').value;
      const amount = parseFloat($('dedAmount').value);
      const month = $('dedMonth').value;
      const reason = $('dedReason').value;
      const validation = $('dedValidation');
      if (!employeeId || !month) {
        validation.textContent = 'Employee and month are required.';
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
    const r = await fetchJson('/api/payroll/deductions');
    const container = $('dedList');
    if (r.status !== 200) { container.textContent = `Error: ${r.body.message || r.status}`; return; }
    container.innerHTML = '';
    const list = Array.isArray(r.body) ? r.body : (r.body && Array.isArray(r.body.data) ? r.body.data : []);
    if (!Array.isArray(list) || list.length === 0) { container.textContent = 'No deductions'; return; }
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

  // Savings
  $('loadSavings').addEventListener('click', () => loadSavings());
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
  async function updateRunPreview() {
    const empSel = $('runEmployeeSelect');
    const month = $('runMonth').value;
    const preview = $('runPreview');
    if (!preview) return;
    const empName = empSel && empSel.selectedOptions[0] ? empSel.selectedOptions[0].textContent : 'Select employee';
    const employeeId = empSel ? empSel.value : '';
    preview.textContent = `Preview: ${empName} • ${month || 'Select month'} • Gross: -- • Net: -- • Deductions: --`;
    if (!employeeId || !month) return;
    clearTimeout(runPreviewTimer);
    runPreviewTimer = setTimeout(async () => {
      const r = await fetchJson(`/api/payroll/records?month=${encodeURIComponent(month)}`);
      if (r.status !== 200 || !Array.isArray(r.body)) return;
      const match = r.body.find(rec => rec.employee && rec.employee._id === employeeId);
      if (!match) return;
      const deductionsCount = Array.isArray(match.deductions) ? match.deductions.length : 0;
      preview.textContent = `Preview: ${empName} • ${month} • Gross: ${match.gross_salary} • Net: ${match.net_salary} • Deductions: ${deductionsCount}`;
    }, 250);
  }
  $('runEmployeeSelect').addEventListener('change', updateRunPreview);
  $('runMonth').addEventListener('change', updateRunPreview);
  const forceToggle = $('runForce');
  const forceWarning = $('runForceWarning');
  if (forceToggle && forceWarning) {
    forceToggle.addEventListener('change', () => {
      forceWarning.style.display = forceToggle.checked ? 'block' : 'none';
    });
  }
  const runForm = document.getElementById('runPayrollForm');
  if (runForm) {
    runForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const employeeId = $('runEmployeeSelect').value;
      const month = $('runMonth').value;
      const idemp = $('runIdemp').value.trim();
      const force = $('runForce').checked;
      const validation = $('runValidation');
      if (force) {
        const ok = window.confirm('Force run will overwrite existing payroll for this month. Continue?');
        if (!ok) return;
      }
      if (!employeeId || !month) {
        validation.textContent = 'Employee and month are required.';
        return;
      }
      validation.textContent = '';
      const headers = { 'Content-Type': 'application/json' };
      if (idemp) headers['Idempotency-Key'] = idemp;
      const r = await fetchJson('/api/payroll/generate/employee', { method: 'POST', headers, body: JSON.stringify({ employeeId, month, force, idempotencyKey: idemp }) });
      const el = $('runResp');
      if (r.status === 200) {
        el.textContent = 'Success: ' + JSON.stringify(r.body.payrollRecord || r.body, null, 2);
        showToast('Payroll generated');
      } else {
        el.textContent = 'Error: ' + JSON.stringify(r.body || r.status);
      }
    });
  }

  // Scheduler
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
  $('startSched').addEventListener('click', async () => {
    const payroll_group = $('schedGroup').value;
    const cronExpression = $('schedExpr').value;
    const r = await fetchJson('/api/payroll/schedule/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payroll_group, cronExpression }) });
    if (r.status === 200) {
      $('schedMsg').textContent = 'Scheduler started';
      setSchedStatus('Running', true);
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
      $('schedMsg').textContent = 'Scheduler stopped';
      setSchedStatus('Stopped', false);
    } else {
      $('schedMsg').textContent = `Error: ${r.body.message || r.status}`;
    }
  });
  $('statusSched').addEventListener('click', async () => {
    const payroll_group = $('schedGroup').value;
    const r = await fetchJson(`/api/payroll/schedule?payroll_group=${encodeURIComponent(payroll_group)}`);
    if (r.status === 200) {
      $('schedMsg').textContent = JSON.stringify(r.body);
      const running = typeof r.body?.running === 'boolean' ? r.body.running : null;
      if (running !== null) setSchedStatus(running ? 'Running' : 'Stopped', running);
    } else {
      $('schedMsg').textContent = `Error: ${r.body.message || r.status}`;
    }
  });

  // Initialize scheduler status controls
  setSchedStatus('Unknown', null);

  // routing
  function init() { showRoute(); loadEmployees(); refreshMe(); }

  // start
  init();
})();