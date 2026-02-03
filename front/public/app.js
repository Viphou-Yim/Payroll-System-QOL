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

  async function loadEmployees() {
    const sel = $('employeeSelect');
    sel.innerHTML = '<option>Loading...</option>';
    const r = await fetchJson('/api/payroll/employees');
    if (r.status !== 200) { sel.innerHTML = '<option>Error loading</option>'; return; }
    sel.innerHTML = '';
    r.body.forEach(e => {
      const opt = document.createElement('option'); opt.value = e._id; opt.textContent = `${e.name} (${e.payroll_group})`; sel.appendChild(opt);
    });
    const runSel = $('runEmployeeSelect'); runSel.innerHTML = '';
    r.body.forEach(e => { const opt = document.createElement('option'); opt.value = e._id; opt.textContent = `${e.name} (${e.payroll_group})`; runSel.appendChild(opt); });
    const dedSel = $('dedEmployeeSelect'); dedSel.innerHTML = '';
    r.body.forEach(e => { const opt = document.createElement('option'); opt.value = e._id; opt.textContent = `${e.name}`; dedSel.appendChild(opt); });
  }

  $('saveAtt').addEventListener('click', async () => {
    const employeeId = $('employeeSelect').value;
    const month = $('attMonth').value;
    const days_worked = parseInt($('attDays').value, 10);
    const days_absent = parseInt($('attAbsent').value, 10);
    const r = await fetchJson('/api/payroll/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId, month, days_worked, days_absent }) });
    $('attMsg').textContent = r.status === 200 ? 'Saved' : `Error: ${JSON.stringify(r.body) || r.status}`;
  });

  let currentRecords = [];
  function escapeCsv(val) { if (val === null || val === undefined) return ''; const s = typeof val === 'string' ? val : String(val); if (s.includes(',') || s.includes('\n') || s.includes('"')) { return '"' + s.replace(/"/g,'""') + '"'; } return s; }
  function downloadCsv(filename, rows) { const csv = rows.join('\n'); const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 1000); }
  function recordsToCsvRows(records) { const header = ['Employee','EmployeeId','Month','Gross','TotalDeductions','Net','Withheld','CarryoverSavings','Bonuses','DeductionsJSON']; const rows = [header.join(',')]; for (const r of records) { const emp = r.employee ? r.employee.name : (r.employee || ''); const empId = r.employee && r.employee._id ? r.employee._id : (r.employee || ''); const deductionsJson = JSON.stringify(r.deductions || []); const row = [escapeCsv(emp), escapeCsv(empId), escapeCsv(r.month), escapeCsv(r.gross_salary), escapeCsv(r.total_deductions), escapeCsv(r.net_salary), escapeCsv(r.withheld_amount), escapeCsv(r.carryover_savings), escapeCsv(r.bonuses), escapeCsv(deductionsJson)]; rows.push(row.join(',')); } return rows; }
  function showRecordDetails(rec) { const d = $('recordDetails'); d.style.display = 'block'; const emp = rec.employee ? `${rec.employee.name} (${rec.employee._id})` : (rec.employee || ''); d.textContent = `Employee: ${emp}\nMonth: ${rec.month}\nGross: ${rec.gross_salary}\nTotal deductions: ${rec.total_deductions}\nNet: ${rec.net_salary}\nWithheld: ${rec.withheld_amount}\nCarryover savings: ${rec.carryover_savings}\nBonuses: ${JSON.stringify(rec.bonuses, null, 2)}\nDeductions: ${JSON.stringify(rec.deductions, null, 2)}`;
    const btnId = 'exportRecBtn'; if (!document.getElementById(btnId)) { const btn = document.createElement('button'); btn.id = btnId; btn.textContent = 'Export This Record CSV'; btn.addEventListener('click', () => { const rows = recordsToCsvRows([rec]); downloadCsv(`payroll_${rec.employee && rec.employee._id ? rec.employee._id : 'record'}_${rec.month}.csv`, rows); }); d.appendChild(document.createElement('div')).appendChild(btn); }
  }

  $('loadRecords').addEventListener('click', () => { renderRecords(); });

  async function renderRecords() {
    const month = $('recMonth').value;
    const r = await fetchJson(`/api/payroll/records?month=${encodeURIComponent(month)}`);
    const container = $('recordsList');
    if (r.status !== 200) { container.textContent = `Error: ${r.body.message || r.status}`; return; }
    container.innerHTML = '';
    currentRecords = r.body || [];
    if (!Array.isArray(currentRecords) || currentRecords.length === 0) { container.textContent = 'No records found'; return; }
    const tbl = document.createElement('table'); tbl.border = 1; tbl.cellPadding = 6; const h = document.createElement('tr'); ['Employee','Month','Gross','Deductions','Net','Actions'].forEach(t => { const th = document.createElement('th'); th.textContent = t; h.appendChild(th); }); tbl.appendChild(h);
    currentRecords.forEach(rec => {
      const tr = document.createElement('tr'); const emp = rec.employee ? rec.employee.name : (rec.employee || ''); const viewBtn = `<button class="viewBtn">View</button>`;
      tr.innerHTML = `<td>${emp}</td><td>${rec.month}</td><td>${rec.gross_salary}</td><td>${rec.total_deductions}</td><td>${rec.net_salary}</td><td>${viewBtn}</td>`;
      tr.querySelector('.viewBtn').addEventListener('click', () => showRecordDetails(rec)); tbl.appendChild(tr);
    });
    container.appendChild(tbl);
  }

  $('exportCsv').addEventListener('click', () => {
    if (!currentRecords || currentRecords.length === 0) { alert('No records loaded'); return; }
    const month = $('recMonth').value || new Date().toISOString().slice(0,7);
    const rows = recordsToCsvRows(currentRecords);
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

  async function refreshMe() { const r = await fetchJson('/api/auth/me'); const status = $('loginStatus'); if (r.status === 200) { status.textContent = `Logged in as ${r.body.user.username} (${r.body.user.role})`; } else { status.textContent = 'Not logged in'; } }

  $('loginBtn').addEventListener('click', async () => {
    const username = $('loginUser').value; const password = $('loginPass').value;
    const r = await fetchJson('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    if (r.status === 200) { $('loginStatus').textContent = `Logged in as ${r.body.user.username} (${r.body.user.role})`; await loadEmployees(); } else { alert('Login failed'); }
  });

  $('logoutBtn').addEventListener('click', async () => { const r = await fetchJson('/api/auth/logout', { method: 'POST' }); if (r.status === 200) { $('loginStatus').textContent = 'Not logged in'; } else { alert('Logout failed'); } });

  function showRoute() { const hash = (window.location.hash || '#attendance').replace('#',''); document.querySelectorAll('.page').forEach(p => p.style.display = 'none'); const el = document.querySelector(`[data-route="${hash}"]`); if (el) el.style.display = ''; if (hash === 'attendance') { loadEmployees(); } if (hash === 'records') { renderRecords(); } if (hash === 'run') { loadEmployees(); } if (hash === 'deductions') { loadDeductions(); loadEmployees(); } if (hash === 'savings') { loadSavings(); } }
  window.addEventListener('hashchange', showRoute);

  // Deductions
  $('createDed').addEventListener('click', async () => { const employeeId = $('dedEmployeeSelect').value; const type = $('dedType').value; const amount = parseFloat($('dedAmount').value); const month = $('dedMonth').value; const reason = $('dedReason').value; const r = await fetchJson('/api/payroll/deductions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId, type, amount, month, reason }) }); if (r.status === 200) { alert('Deduction created'); loadDeductions(); } else { alert('Error: ' + JSON.stringify(r.body)); } });
  $('loadDeds').addEventListener('click', () => loadDeductions());
  async function loadDeductions() { const r = await fetchJson('/api/payroll/deductions'); const container = $('dedList'); if (r.status !== 200) { container.textContent = `Error: ${r.body.message || r.status}`; return; } container.innerHTML = ''; if (!Array.isArray(r.body) || r.body.length === 0) { container.textContent = 'No deductions'; return; } const ul = document.createElement('ul'); r.body.forEach(d => { const li = document.createElement('li'); const emp = d.employee && d.employee.name ? d.employee.name : (d.employee || ''); li.textContent = `${emp} - ${d.type} - ${d.amount} - ${d.month} - ${d.reason || ''}`; const del = document.createElement('button'); del.textContent = 'Delete'; del.addEventListener('click', async () => { const rr = await fetchJson(`/api/payroll/deductions/${d._id}`, { method: 'DELETE' }); if (rr.status === 200) { loadDeductions(); } else { alert('Delete failed'); } }); li.appendChild(document.createTextNode(' ')); li.appendChild(del); ul.appendChild(li); }); container.appendChild(ul); }

  // Savings
  $('loadSavings').addEventListener('click', () => loadSavings());
  async function loadSavings() { const r = await fetchJson('/api/payroll/savings'); const container = $('savingsList'); if (r.status !== 200) { container.textContent = `Error: ${r.body.message || r.status}`; return; } container.innerHTML = ''; if (!Array.isArray(r.body) || r.body.length === 0) { container.textContent = 'No savings'; return; } const tbl = document.createElement('table'); tbl.border = 1; tbl.cellPadding = 6; const h = document.createElement('tr'); ['Employee','Amount','Accumulated','Actions'].forEach(t => { const th = document.createElement('th'); th.textContent = t; h.appendChild(th); }); tbl.appendChild(h); r.body.forEach(s => { const tr = document.createElement('tr'); const emp = s.employee ? s.employee.name : (s.employee || ''); tr.innerHTML = `<td>${emp}</td><td>${s.amount}</td><td>${s.accumulated_total}</td>`; const updBtn = document.createElement('button'); updBtn.textContent = 'Update'; updBtn.addEventListener('click', async () => { const newAmount = parseFloat(prompt('Amount', s.amount)); const reset = confirm('Reset accumulated total?'); const rr = await fetchJson(`/api/payroll/savings/${s.employee._id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: newAmount, resetAccumulated: reset }) }); if (rr.status === 200) { loadSavings(); } else { alert('Update failed'); } }); const td = document.createElement('td'); td.appendChild(updBtn); tr.appendChild(td); tbl.appendChild(tr); }); container.appendChild(tbl); }

  // Run employee payroll
  $('runPayrollEmp').addEventListener('click', async () => {
    const employeeId = $('runEmployeeSelect').value; const month = $('runMonth').value; const idemp = $('runIdemp').value.trim(); const force = $('runForce').checked; const headers = { 'Content-Type': 'application/json' }; if (idemp) headers['Idempotency-Key'] = idemp; const r = await fetchJson('/api/payroll/generate/employee', { method: 'POST', headers, body: JSON.stringify({ employeeId, month, force, idempotencyKey: idemp }) }); const el = $('runResp'); if (r.status === 200) { el.textContent = 'Success: ' + JSON.stringify(r.body.payrollRecord || r.body, null, 2); } else { el.textContent = 'Error: ' + JSON.stringify(r.body || r.status); } });

  // Scheduler
  $('startSched').addEventListener('click', async () => { const payroll_group = $('schedGroup').value; const cronExpression = $('schedExpr').value; const r = await fetchJson('/api/payroll/schedule/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payroll_group, cronExpression }) }); $('schedMsg').textContent = r.status === 200 ? 'Scheduler started' : `Error: ${r.body.message || r.status}`; });
  $('stopSched').addEventListener('click', async () => { const payroll_group = $('schedGroup').value; const r = await fetchJson('/api/payroll/schedule/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payroll_group }) }); $('schedMsg').textContent = r.status === 200 ? 'Scheduler stopped' : `Error: ${r.body.message || r.status}`; });
  $('statusSched').addEventListener('click', async () => { const payroll_group = $('schedGroup').value; const r = await fetchJson(`/api/payroll/schedule?payroll_group=${encodeURIComponent(payroll_group)}`); $('schedMsg').textContent = r.status === 200 ? JSON.stringify(r.body) : `Error: ${r.body.message || r.status}`; });

  // routing
  function init() { showRoute(); window.addEventListener('hashchange', showRoute); loadEmployees(); refreshMe(); }
  function showRoute() { const hash = (window.location.hash || '#attendance').replace('#',''); document.querySelectorAll('.page').forEach(p => p.style.display = 'none'); const el = document.querySelector(`[data-route="${hash}"]`); if (el) el.style.display = ''; if (hash === 'attendance') { loadEmployees(); } if (hash === 'records') { renderRecords(); } if (hash === 'run') { loadEmployees(); } if (hash === 'deductions') { loadDeductions(); loadEmployees(); } if (hash === 'savings') { loadSavings(); } }

  // start
  init();
})();