/* App shell: routing, file list, file form, file detail, settings. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const view = () => $('#view');

const UI = { month: thisMonth(), scope: 'logged', status: 'all', q: '', stage: '' };

/* ---------- form schema (mirrors the four documents in a loan file) ---------- */

const FORM = [
  { title: 'Axis Bank file cover', note: 'The blue "HOME LOAN" cover sheet', fields: [
    { k: 'applicantName', label: 'Applicant name', req: true },
    { k: 'coApplicantName', label: 'Co-applicant name' },
    { k: 'coApplicantRelation', label: 'Co-applicant relation', type: 'select', options: ['', 'Wife', 'Husband', 'Mother', 'Father', 'Son', 'Daughter', 'Brother', 'Sister', 'Other'] },
    { k: 'appId', label: 'New App ID / FINNONE no.', req: true, hint: 'Number written on the cover, e.g. 32029374' },
    { k: 'oldAppId', label: 'Old App ID (main loan)' },
    { k: 'salesManager', label: 'Axis Sales Manager', req: true, list: 'dl-sm' },
    { k: 'teamLeader', label: 'Team Leader' },
    { k: 'dsaName', label: 'DSA name', list: 'dl-dsa' },
    { k: 'branch', label: 'Branch', def: 'Maninagar' },
    { k: 'product', label: 'Product', def: 'Insurance – Bajaj' },
    { k: 'pan', label: 'PAN', upper: true },
    { k: 'mobile', label: 'Applicant mobile' },
    { k: 'email', label: 'Email' },
    { k: 'fileNo', label: 'File no.' },
    { k: 'loanAccountNo', label: 'Loan account no.' },
    { k: 'leadId', label: 'Lead ID' }
  ]},
  { title: 'Main loan (Axis)', fields: [
    { k: 'mainLoanType', label: 'Loan type', type: 'select', options: [''].concat(LOAN_TYPES) },
    { k: 'mainLoanAmount', label: 'Main loan amount (₹)', type: 'number' },
    { k: 'mainLoanTenure', label: 'Tenure (years)', type: 'number' },
    { k: 'mainLoanRate', label: 'Interest rate (%)', type: 'number', step: '0.01' },
    { k: 'propertyLocation', label: 'Property location', span: 2 }
  ]},
  { title: 'GCPP calculator (Bajaj)', note: 'Group Credit Protection Plus. GST and total are calculated for you.', fields: [
    { k: 'sumAssured', label: 'Sum assured (₹)', type: 'number' },
    { k: 'actualSumAssured', label: 'Actual sum assured (₹)', type: 'number' },
    { k: 'coverTerm', label: 'Term of cover (years)', type: 'number' },
    { k: 'coverType', label: 'Cover', type: 'select', options: ['Level', 'Reducing'] },
    { k: 'rider', label: 'Rider', type: 'select', options: ['ACI', 'APTD', 'ACI + APTD', 'None'] },
    { k: 'premiumFinanced', label: 'Premium financed', type: 'select', options: ['Yes', 'No'] },
    { k: 'dob', label: 'Date of birth', type: 'date' },
    { k: 'age', label: 'Age (years)', type: 'number', calc: true },
    { k: 'gcppDate', label: 'Calculation date', type: 'date' },
    { k: 'basicPremium', label: 'Basic premium (₹)', type: 'number' },
    { k: 'gst', label: 'GST 18% (₹)', type: 'number', calc: true },
    { k: 'totalPremium', label: 'Premium for app form (₹)', type: 'number', calc: true },
    { k: 'masterPolicyNo', label: 'MPH / Master policy no.', def: '591761952' }
  ]},
  { title: 'Bajaj member enrollment form', fields: [
    { k: 'subId', label: 'Sub ID', def: '7AAX057976' },
    { k: 'scheme', label: 'Scheme', def: 'GCPP' },
    { k: 'premiumTerm', label: 'Premium type', type: 'select', options: ['Single', 'Regular'] },
    { k: 'gender', label: 'Gender', type: 'select', options: ['', 'M', 'F', 'Other'] },
    { k: 'occupation', label: 'Occupation', type: 'select', options: ['', 'Salaried', 'Self-employed', 'Business', 'Professional', 'Housewife', 'Retired', 'Student', 'Other'] },
    { k: 'placeOfBirth', label: 'Place of birth' },
    { k: 'height', label: 'Height (cm)', type: 'number' },
    { k: 'weight', label: 'Weight (kg)', type: 'number' },
    { k: 'smq', label: 'Medical questionnaire', type: 'select', options: ['All answers "No"', 'Has "Yes" answer(s)'] },
    { k: 'nomineeName', label: 'Nominee name' },
    { k: 'nomineeRelation', label: 'Nominee relation' },
    { k: 'nomineeMobile', label: 'Nominee mobile' },
    { k: 'address', label: 'Permanent address', type: 'textarea', span: 3 }
  ]},
  { title: 'Insurance sanction letter (Axis)', note: 'Loan amount = property + life + health. ROI and EMI are calculated for you.', fields: [
    { k: 'approvalNo', label: 'Approval no.', span: 2, hint: 'IN_LNPINS_FLOATING_BRE / FINNONE_… / MANINAGAR ASC- / 26-27' },
    { k: 'sanctionDate', label: 'Sanction letter date', type: 'date' },
    { k: 'propertyInsPremium', label: '1. Property insurance (₹)', type: 'number' },
    { k: 'lifeInsPremium', label: '2. Life insurance (₹)', type: 'number', calc: true },
    { k: 'healthInsPremium', label: '3. Health insurance (₹)', type: 'number' },
    { k: 'insLoanAmount', label: 'Insurance loan amount (₹)', type: 'number', calc: true },
    { k: 'repoRate', label: 'REPO rate (%)', type: 'number', step: '0.01', def: 5.25 },
    { k: 'spread', label: 'Spread (%)', type: 'number', step: '0.01' },
    { k: 'roi', label: 'REPO + spread (%)', type: 'number', step: '0.01', calc: true },
    { k: 'installments', label: 'No. of EMIs (months)', type: 'number', calc: true },
    { k: 'emi', label: 'EMI (₹)', type: 'number', calc: true }
  ]}
];

/* ---------- router ---------- */

function route() {
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  $$('.nav a, .tabbar a').forEach(a => a.classList.toggle('active', a.dataset.nav === (name === 'edit' || name === 'file' ? 'files' : name === 'manager' ? 'managers' : name || 'files')));
  window.scrollTo(0, 0);
  switch (name) {
    case 'new': return renderForm();
    case 'edit': return renderForm(arg);
    case 'file': return renderDetail(arg);
    case 'report': return Report.render(arg || UI.month);
    case 'settings': return renderSettings();
    case 'queries': return renderQueries();
    case 'managers': return Managers.render();
    case 'manager': return Managers.renderOne(arg);
    default: return renderList();
  }
}
window.addEventListener('hashchange', route);

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2400);
}

function stageBadge(fx) {
  const cls = fx.outcome ? 'bad' : fx.completed ? 'done' : fx.openQ.length ? 'query' : 'prog';
  return `<span class="badge ${cls}">${esc(fx.current)}</span>`;
}

/* ---------- list ---------- */

function monthOptions(sel) {
  const files = Store.files(), s = Store.settings();
  const set = new Set([thisMonth(), sel]);
  files.forEach(f => { const fx = fileFacts(f, s); if (fx.loginAt) set.add(monthKey(fx.loginAt)); });
  return Array.from(set).sort().reverse().map(m => `<option value="${m}" ${m === sel ? 'selected' : ''}>${monthLabel(m)}</option>`).join('');
}

function renderList() {
  const s = Store.settings();
  const all = Store.files().map(f => ({ f, fx: fileFacts(f, s) }));
  const m = UI.month;
  const inMonth = ({ fx }) => fx.loginAt && monthKey(fx.loginAt) === m;
  const monthEnd = new Date(+m.slice(0, 4), +m.slice(5), 1);
  const activeIn = ({ fx }) => inMonth({ fx }) || (fx.loginAt && fx.loginAt < monthEnd && (!fx.closed || (fx.segments.length && monthKey(fx.segments[fx.segments.length - 1].start) === m)));

  const scoped = all.filter(UI.scope === 'all' ? () => true : UI.scope === 'active' ? activeIn : inMonth);
  const target = Store.targetFor(m);
  const logged = all.filter(inMonth);
  const booked = all.filter(({ fx }) => fx.bizAt && monthKey(fx.bizAt) === m);
  const premium = booked.reduce((a, { fx }) => a + fx.premium, 0);
  const inProcess = scoped.filter(({ fx }) => !fx.closed);
  const openQ = scoped.reduce((a, { fx }) => a + fx.openQ.length, 0);
  const tats = booked.map(({ fx }) => fx.bizMs).filter(v => v != null);
  const avgTat = tats.length ? tats.reduce((a, b) => a + b, 0) / tats.length : null;

  // stage counts for chips
  const stageCounts = {};
  scoped.forEach(({ fx }) => { stageCounts[fx.current] = (stageCounts[fx.current] || 0) + 1; });

  let rows = scoped.filter(({ f, fx }) => {
    if (UI.stage && fx.current !== UI.stage) return false;
    if (UI.status === 'process' && fx.closed) return false;
    if (UI.status === 'query' && !fx.openQ.length) return false;
    if (UI.status === 'done' && !fx.completed) return false;
    if (UI.status === 'closed' && !fx.outcome) return false;
    if (UI.q) {
      const hay = [f.applicantName, f.coApplicantName, f.appId, f.oldAppId, f.salesManager, f.dsaName, f.pan].join(' ').toLowerCase();
      if (!hay.includes(UI.q.toLowerCase())) return false;
    }
    return true;
  }).sort((a, b) => (b.fx.loginAt || 0) - (a.fx.loginAt || 0));

  const pct = target.premium ? Math.round(premium / target.premium * 100) : 0;

  view().innerHTML = `
  <div class="page-head">
    <div>
      <h1>Loan insurance files</h1>
      <p class="sub">${esc(s.rmName)} · ${esc(s.designation)} · Sub ID ${esc(s.subId)}</p>
    </div>
    <div class="head-actions">
      <div class="month-pick">
        <button class="icon-btn" id="m-prev" aria-label="Previous month">‹</button>
        <select id="m-sel">${monthOptions(m)}</select>
        <button class="icon-btn" id="m-next" aria-label="Next month">›</button>
      </div>
      <a class="btn" href="#new">+ New file</a>
      <a class="btn primary" href="#report/${m}">Generate report</a>
    </div>
  </div>

  ${PWA.installBanner()}
  <div class="kpis">
    <div class="kpi"><span>Files logged</span><b>${logged.length}</b><small>target ${target.files}</small></div>
    <div class="kpi wide"><span>Business done · life premium</span><b>${inr(premium, true)}</b>
      <div class="mini-track"><div style="width:${Math.min(100, pct)}%"></div></div><small>${pct}% of ${inr(target.premium, true)} · ${booked.length} file${booked.length === 1 ? '' : 's'} reached ${esc(s.businessStage)}</small></div>
    <div class="kpi"><span>In process</span><b>${inProcess.length}</b><small>${esc(scopeLabel())}</small></div>
    <div class="kpi"><span>Disbursed</span><b>${scoped.filter(x => x.fx.completed).length}</b><small>${scoped.filter(x => x.fx.outcome).length} rejected / cancelled</small></div>
    <a class="kpi link ${openQ ? 'alert' : ''}" href="#queries"><span>Open queries ›</span><b>${openQ}</b><small>${scoped.reduce((a, x) => a + x.fx.queries.length, 0)} raised in total</small></a>
    <div class="kpi"><span>Avg TAT to ${esc(shortStage(s.businessStage))}</span><b>${avgTat != null ? dur(avgTat) : '–'}</b><small>benchmark ${s.tatBenchmarkDays}d</small></div>
  </div>

  <div class="stage-chips">
    <button class="chip ${!UI.stage ? 'on' : ''}" data-stage="">All stages <b>${scoped.length}</b></button>
    ${s.stages.concat(OUTCOMES).filter(st => stageCounts[st]).map(st => `<button class="chip ${UI.stage === st ? 'on' : ''}" data-stage="${esc(st)}">${esc(st)} <b>${stageCounts[st]}</b></button>`).join('')}
  </div>

  <div class="toolbar">
    <input type="search" id="q" placeholder="Search name, App ID, PAN, sales manager…" value="${esc(UI.q)}">
    <select id="scope">
      <option value="logged" ${UI.scope === 'logged' ? 'selected' : ''}>Logged in ${monthLabel(m)}</option>
      <option value="active" ${UI.scope === 'active' ? 'selected' : ''}>Worked in ${monthLabel(m)} (incl. carried over)</option>
      <option value="all" ${UI.scope === 'all' ? 'selected' : ''}>All files, all months</option>
    </select>
    <select id="status">
      <option value="all">Any status</option>
      <option value="process" ${UI.status === 'process' ? 'selected' : ''}>In process</option>
      <option value="query" ${UI.status === 'query' ? 'selected' : ''}>Has open query</option>
      <option value="done" ${UI.status === 'done' ? 'selected' : ''}>Disbursed</option>
      <option value="closed" ${UI.status === 'closed' ? 'selected' : ''}>Rejected / cancelled</option>
    </select>
  </div>

  ${rows.length ? `
  <div class="table-wrap">
  <table class="list">
    <thead><tr>
      <th>Applicant / App ID</th><th>Source</th><th>Loan type</th>
      <th class="r">Life premium</th><th class="r">Ins. loan</th>
      <th>Current stage</th><th class="r">In stage</th><th class="r">Total TAT</th><th>Queries</th>
    </tr></thead>
    <tbody>
    ${rows.map(({ f, fx }) => `
      <tr data-id="${f.id}">
        <td><a href="#file/${f.id}" class="name">${esc(f.applicantName || '(no name)')}</a><div class="muted">${esc(f.appId || '–')} · logged ${fmtDate(fx.loginAt)}</div></td>
        <td data-label="Sales manager">${f.salesManager ? `<a href="#manager/${encodeURIComponent(Managers.keyOf(f.salesManager))}">${esc(f.salesManager)}</a>` : '–'}<div class="muted">${esc(f.dsaName ? 'DSA ' + f.dsaName : '')}</div></td>
        <td data-label="Loan type">${esc(f.mainLoanType || '–')}</td>
        <td class="r num" data-label="Life premium">${fx.premium ? inr(fx.premium) : '–'}</td>
        <td class="r num" data-label="Ins. loan">${fx.loan ? inr(fx.loan) : '–'}</td>
        <td>${stageBadge(fx)}<div class="progress" title="${Math.round(fx.progress * 100)}% through the process"><div style="width:${fx.progress * 100}%"></div></div></td>
        <td data-label="In stage" class="r num ${!fx.closed && days(fx.inStageMs) > s.stageBenchmarkDays ? 'late' : ''}">${fx.closed ? '–' : dur(fx.inStageMs)}</td>
        <td class="r num" data-label="Total TAT">${dur(fx.totalMs)}${fx.closed ? '' : '<div class="muted">running</div>'}</td>
        <td data-label="Queries">${fx.queries.length ? `<span class="q-pill ${fx.openQ.length ? 'open' : ''}">${fx.openQ.length ? fx.openQ.length + ' open' : 'resolved'}</span><div class="muted">${fx.queries.length} total</div>` : '<span class="muted">none</span>'}</td>
      </tr>`).join('')}
    </tbody>
  </table></div>` : emptyState(all.length)}
  `;

  $('#m-sel').onchange = e => { UI.month = e.target.value; renderList(); };
  $('#m-prev').onclick = () => { UI.month = shiftMonth(UI.month, -1); renderList(); };
  $('#m-next').onclick = () => { UI.month = shiftMonth(UI.month, 1); renderList(); };
  $('#scope').onchange = e => { UI.scope = e.target.value; renderList(); };
  $('#status').onchange = e => { UI.status = e.target.value; renderList(); };
  const q = $('#q');
  q.oninput = e => { UI.q = e.target.value; renderList(); const n = $('#q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
  $$('.chip').forEach(c => c.onclick = () => { UI.stage = c.dataset.stage; renderList(); });
  $$('tr[data-id]').forEach(tr => tr.onclick = e => { if (!e.target.closest('a')) location.hash = '#file/' + tr.dataset.id; });
  const loadBtn = $('#load-sample'); if (loadBtn) loadBtn.onclick = loadSamples;
  PWA.bindBanner(view());
}

function scopeLabel() { return UI.scope === 'all' ? 'all files' : UI.scope === 'active' ? 'incl. carried over' : 'logged this month'; }
function shortStage(s) { return s.length > 18 ? s.split(' ')[0] : s; }

function emptyState(hasAny) {
  return `<div class="empty">
    <h3>${hasAny ? 'No files match these filters' : 'No files yet'}</h3>
    <p>${hasAny ? 'Try another month or clear the filters.' : 'Add your first loan file, or load the 3 sample files taken from your reference documents to try the app out.'}</p>
    <div class="row-actions"><a class="btn primary" href="#new">+ New file</a>${hasAny ? '' : '<button class="btn" id="load-sample">Load 3 sample files</button>'}</div>
  </div>`;
}

function loadSamples() {
  const list = Store.files().concat(sampleFiles());
  Store.saveFiles(list);
  UI.month = '2026-09'; UI.scope = 'active';
  toast('Loaded 3 sample files');
  route();
}

/* ---------- form ---------- */

function renderForm(id) {
  const s = Store.settings();
  const f = id ? Store.get(id) : null;
  if (id && !f) return notFound();
  const data = f || {};
  const files = Store.files();
  const uniq = k => Array.from(new Set(files.map(x => x[k]).filter(Boolean)));

  const field = fd => {
    const v = data[fd.k] ?? (f ? '' : fd.def ?? '');
    const attrs = `id="f-${fd.k}" name="${fd.k}" ${fd.req ? 'required' : ''} ${fd.list ? `list="${fd.list}"` : ''}`;
    let input;
    if (fd.type === 'select') input = `<select ${attrs}>${fd.options.map(o => `<option ${String(v) === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    else if (fd.type === 'textarea') input = `<textarea ${attrs} rows="2">${esc(v)}</textarea>`;
    else input = `<input ${attrs} type="${fd.type || 'text'}" ${fd.type === 'number' ? `step="${fd.step || 'any'}" inputmode="decimal"` : ''} value="${esc(v)}" ${fd.upper ? 'style="text-transform:uppercase"' : ''}>`;
    return `<label class="fld ${fd.span ? 'span' + fd.span : ''} ${fd.calc ? 'calc' : ''}"><span>${esc(fd.label)}${fd.req ? ' <i class="req">*</i>' : ''}${fd.calc ? ' <i class="auto">auto</i>' : ''}</span>${input}${fd.hint ? `<small>${esc(fd.hint)}</small>` : ''}</label>`;
  };

  view().innerHTML = `
  <div class="page-head">
    <div><a href="${f ? '#file/' + f.id : '#files'}" class="back">‹ Back</a><h1>${f ? 'Edit file · ' + esc(f.applicantName) : 'New loan insurance file'}</h1>
    <p class="sub">The sections follow the four documents in the file: cover sheet, GCPP calculator, enrollment form and sanction letter.</p></div>
  </div>
  <section class="card upload-card" id="upload">
    <div class="card-h"><span class="step">📷</span><div><h2>Fill from photos</h2>
      <p>Upload the photos of the file (cover sheet, sanction letter, enrollment form, GCPP calculator). Claude reads them and fills the form below for you to check.${f ? ' Only empty fields are filled.' : ''}</p></div></div>
    <label class="dropzone" id="dz">
      <input type="file" id="photo-input" accept="image/*" multiple hidden>
      <b class="only-desk">Drop photos here or click to choose</b><b class="only-phone">Tap to take photos or pick from gallery</b><span>All pages of one file at a time</span>
    </label>
    <div class="thumbs" id="thumbs"></div>
    <div class="upload-actions">
      <span class="muted" id="ai-status">${s.apiKey ? '' : 'Add your Claude API key in <a href="#settings">Settings</a> to read photos automatically.'}</span>
      <button type="button" class="btn primary" id="ai-read" disabled>Read documents</button>
    </div>
  </section>
  <form id="file-form" class="card-form" novalidate>
    <datalist id="dl-sm">${uniq('salesManager').map(v => `<option value="${esc(v)}">`).join('')}</datalist>
    <datalist id="dl-dsa">${uniq('dsaName').map(v => `<option value="${esc(v)}">`).join('')}</datalist>
    ${FORM.map((sec, i) => `
      <section class="card">
        <div class="card-h"><span class="step">${i + 1}</span><div><h2>${esc(sec.title)}</h2>${sec.note ? `<p>${esc(sec.note)}</p>` : ''}</div></div>
        <div class="grid">${sec.fields.map(field).join('')}</div>
      </section>`).join('')}
    ${f ? '' : `
      <section class="card">
        <div class="card-h"><span class="step">${FORM.length + 1}</span><div><h2>Current status</h2><p>Which stage is the file at now? You can add the earlier stages later from the file page.</p></div></div>
        <div class="grid">
          <label class="fld"><span>Main loan login date & time <i class="req">*</i></span><input type="datetime-local" id="f-loginAt" value="${nowLocalInput()}" required></label>
          <label class="fld"><span>Current stage</span><select id="f-stage">${s.stages.map(st => `<option>${esc(st)}</option>`).join('')}</select></label>
          <label class="fld"><span>Reached current stage on</span><input type="datetime-local" id="f-stageAt" value="${nowLocalInput()}"></label>
        </div>
      </section>`}
    <section class="card">
      <div class="card-h"><span class="step">✎</span><div><h2>Remarks</h2></div></div>
      <div class="grid"><label class="fld span3"><textarea name="remarks" rows="3" placeholder="Anything worth noting about this file…">${esc(data.remarks || '')}</textarea></label></div>
    </section>
    <div class="form-actions sticky">
      <a class="btn" href="${f ? '#file/' + f.id : '#files'}">Cancel</a>
      <button class="btn primary" type="submit">${f ? 'Save changes' : 'Create file'}</button>
    </div>
  </form>`;

  const form = $('#file-form');
  const get = k => { const el = form.elements[k]; return el ? el.value : ''; };
  const set = (k, v) => { const el = form.elements[k]; if (el) el.value = v === '' || v == null || isNaN(v) ? '' : (Math.round(v * 100) / 100); };

  function recalc(changed) {
    if (['basicPremium'].includes(changed)) { const g = Math.round(num(get('basicPremium')) * 0.18); set('gst', g); }
    if (['basicPremium', 'gst'].includes(changed)) set('totalPremium', num(get('basicPremium')) + num(get('gst')));
    if (['basicPremium', 'gst', 'totalPremium'].includes(changed)) set('lifeInsPremium', num(get('totalPremium')));
    if (['basicPremium', 'gst', 'totalPremium', 'propertyInsPremium', 'lifeInsPremium', 'healthInsPremium'].includes(changed))
      set('insLoanAmount', num(get('propertyInsPremium')) + num(get('lifeInsPremium')) + num(get('healthInsPremium')));
    if (['repoRate', 'spread'].includes(changed)) set('roi', num(get('repoRate')) + num(get('spread')));
    if (changed === 'mainLoanTenure') set('installments', num(get('mainLoanTenure')) * 12);
    if (['dob', 'gcppDate'].includes(changed) && get('dob')) {
      const ref = get('gcppDate') ? new Date(get('gcppDate')) : new Date(), b = new Date(get('dob'));
      let a = ref.getFullYear() - b.getFullYear(); if (ref < new Date(ref.getFullYear(), b.getMonth(), b.getDate())) a--;
      set('age', a);
    }
    if (['basicPremium', 'gst', 'totalPremium', 'propertyInsPremium', 'lifeInsPremium', 'healthInsPremium', 'insLoanAmount', 'repoRate', 'spread', 'roi', 'installments', 'mainLoanTenure'].includes(changed))
      set('emi', Math.round(emi(get('insLoanAmount'), get('roi'), get('installments'))));
  }
  form.addEventListener('input', e => {
    if (!e.target.name) return;
    e.target.closest('.fld')?.classList.remove('ai-filled', 'ai-unsure');
    recalc(e.target.name);
  });

  /* --- photos → form --- */
  let photos = [];          // [{name, dataUrl}]
  let milestones = [];      // stage dates found in the documents (new files only)
  if (f) loadPhotos(f).then(p => { photos = p; drawThumbs(); });
  if (!f && location.hash === '#new/shared') PWA.takeShared().then(list => { if (list.length) { addPhotos(list); toast(list.length + ' shared photo' + (list.length > 1 ? 's' : '') + ' added'); } });
  const readBtn = $('#ai-read'), status = $('#ai-status');

  function drawThumbs() {
    $('#thumbs').innerHTML = photos.map((p, i) => `<figure><img src="${p.dataUrl}" alt="${esc(p.name)}"><button type="button" data-rm="${i}" aria-label="Remove photo">×</button></figure>`).join('');
    $$('[data-rm]').forEach(b => b.onclick = () => { photos.splice(+b.dataset.rm, 1); drawThumbs(); });
    readBtn.disabled = !photos.length || !s.apiKey;
  }
  async function addPhotos(list) {
    const imgs = Array.from(list).filter(x => x.type.startsWith('image/'));
    if (!imgs.length) return;
    status.textContent = 'Preparing photos…';
    for (const file of imgs) { try { photos.push(await Extract.prepare(file)); } catch (e) { toast('Could not open ' + file.name); } }
    status.innerHTML = s.apiKey ? `${photos.length} photo${photos.length > 1 ? 's' : ''} ready. Click <b>Read documents</b>.` : 'Photos will be saved with the file. Add your Claude API key in <a href="#settings">Settings</a> to read them automatically.';
    drawThumbs();
  }
  $('#photo-input').onchange = e => { addPhotos(e.target.files); e.target.value = ''; };
  const dz = $('#dz');
  dz.ondragover = e => { e.preventDefault(); dz.classList.add('over'); };
  dz.ondragleave = () => dz.classList.remove('over');
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove('over'); addPhotos(e.dataTransfer.files); };

  readBtn.onclick = async () => {
    readBtn.disabled = true; readBtn.textContent = 'Reading…';
    status.innerHTML = '<span class="spinner"></span> Claude is reading the documents. This can take up to a minute.';
    try {
      const data = await Extract.read(photos, s.apiKey);
      const n = applyExtracted(data);
      const unsure = (data.uncertainFields || []).length;
      status.innerHTML = `✓ Filled <b>${n}</b> fields from ${esc((data.documentsFound || []).join(', ') || 'the photos')}. ` +
        (unsure ? `<span class="unsure-note">${unsure} field${unsure > 1 ? 's are' : ' is'} marked in orange: please double-check ${unsure > 1 ? 'them' : 'it'}.</span>` : 'Please check the values before saving.') +
        (data.notes ? `<br><span class="muted">Note: ${esc(data.notes)}</span>` : '');
      form.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      status.innerHTML = `<span class="late">${esc(err.message === 'NO_KEY' ? 'Add your Claude API key in Settings first.' : err.message)}</span>`;
    } finally { readBtn.textContent = 'Read documents'; readBtn.disabled = !photos.length || !s.apiKey; }
  };

  function applyExtracted(d) {
    let count = 0;
    const unsure = new Set(d.uncertainFields || []);
    FORM.forEach(sec => sec.fields.forEach(fd => {
      let v = String(d[fd.k] ?? '').trim();
      const el = form.elements[fd.k];
      if (!v || !el || (f && String(el.value).trim())) return;
      if (fd.type === 'number') { v = v.replace(/[^0-9.]/g, ''); if (!v) return; }
      if (fd.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
      if (fd.type === 'select') {
        const opt = fd.options.find(o => o && o.toLowerCase() === v.toLowerCase()) || fd.options.find(o => o && o.toLowerCase().startsWith(v.toLowerCase()));
        if (!opt) return; v = opt;
      }
      if (fd.upper) v = v.toUpperCase();
      el.value = v; count++;
      el.closest('.fld').classList.add(unsure.has(fd.k) ? 'ai-unsure' : 'ai-filled');
    }));
    // Fill calculated fields the documents didn't show.
    const blank = k => form.elements[k] && !form.elements[k].value;
    if (blank('gst') && get('basicPremium')) recalc('basicPremium');
    if (blank('totalPremium') && get('basicPremium')) set('totalPremium', num(get('basicPremium')) + num(get('gst')));
    if (blank('lifeInsPremium') && get('totalPremium')) set('lifeInsPremium', num(get('totalPremium')));
    if (blank('insLoanAmount')) set('insLoanAmount', num(get('propertyInsPremium')) + num(get('lifeInsPremium')) + num(get('healthInsPremium')) || '');
    if (blank('roi') && get('spread')) set('roi', num(get('repoRate')) + num(get('spread')));
    if (blank('installments') && get('mainLoanTenure')) set('installments', num(get('mainLoanTenure')) * 12);
    if (blank('emi') && get('insLoanAmount') && get('installments')) set('emi', Math.round(emi(get('insLoanAmount'), get('roi'), get('installments'))));
    if (blank('age') && get('dob')) recalc('dob');

    if (!f) {
      const okDT = v => /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(v || '');
      const at = v => v.length === 10 ? v + 'T12:00' : v;
      if (okDT(d.mainLoanLoginAt)) { $('#f-loginAt').value = at(d.mainLoanLoginAt); $('#f-loginAt').closest('.fld').classList.add('ai-filled'); }
      milestones = [['GCPP Calculation', d.gcppDate], ['Enrollment Form Signed', d.formSignedDate], ['Insurance Sanction', d.sanctionDate]]
        .filter(([st, v]) => s.stages.includes(st) && okDT(v)).map(([stage, v]) => ({ stage, at: at(v), note: 'Date read from the documents' }));
      const last = milestones.slice().sort((a, b) => a.at.localeCompare(b.at)).pop();
      if (last) { $('#f-stage').value = last.stage; $('#f-stageAt').value = last.at; }
    }
    return count;
  }

  form.onsubmit = e => {
    e.preventDefault();
    const missing = $$('[required]', form).filter(el => !el.value.trim());
    $$('.invalid', form).forEach(el => el.classList.remove('invalid'));
    if (missing.length) { missing.forEach(el => el.classList.add('invalid')); missing[0].focus(); toast('Please fill the required fields'); return; }
    const out = f ? Object.assign({}, f) : { id: uid(), createdAt: new Date().toISOString(), history: [], queries: [] };
    FORM.forEach(sec => sec.fields.forEach(fd => {
      let v = get(fd.k);
      if (fd.type === 'number') v = v === '' ? '' : num(v);
      if (fd.upper) v = v.toUpperCase();
      out[fd.k] = typeof v === 'string' ? v.trim() : v;
    }));
    out.remarks = get('remarks').trim();
    if (!f) {
      const loginAt = $('#f-loginAt').value, stage = $('#f-stage').value, stageAt = $('#f-stageAt').value || loginAt;
      out.history.push({ stage: s.stages[0], at: loginAt, note: '' });
      // Stage dates found in the documents (only those after login), then the chosen current stage.
      milestones.filter(m => m.at >= loginAt && m.stage !== s.stages[0]).forEach(m => {
        if (!out.history.some(h => h.stage === m.stage)) out.history.push(m);
      });
      if (stage !== s.stages[0] && !out.history.some(h => h.stage === stage)) out.history.push({ stage, at: stageAt < loginAt ? loginAt : stageAt, note: '' });
    }
    Extract.photos.set(out.id, photos).catch(() => toast('Saved, but the photos could not be stored in this browser'));
    if (GH.enabled() && photos.some(p => !p.remote)) {
      toast('Saved. Uploading photos to GitHub…');
      GH.uploadPhotos(out, photos).then(paths => {
        const cur = Store.get(out.id); if (!cur) return;
        cur.photoPaths = paths; Store.upsert(cur);
        Extract.photos.set(out.id, photos);
        toast('Photos uploaded to GitHub');
      }).catch(err => toast('Photo upload failed: ' + err.message));
    } else out.photoPaths = photos.map(p => p.remote).filter(Boolean);
    Store.upsert(out);
    toast(f ? 'File updated' : 'File created');
    location.hash = '#file/' + out.id;
  };
}

function notFound() {
  view().innerHTML = `<div class="empty"><h3>File not found</h3><p><a href="#files">Back to files</a></p></div>`;
}

/* ---------- detail ---------- */

function renderDetail(id) {
  const s = Store.settings();
  const f = Store.get(id);
  if (!f) return notFound();
  const fx = fileFacts(f, s);
  const hist = sortedHistory(f);
  const reached = new Map(hist.map(h => [h.stage, h]));
  const lastIdx = fx.stageIdx;

  const info = (label, v) => `<div class="kv"><span>${esc(label)}</span><b>${v === '' || v == null ? '–' : v}</b></div>`;

  view().innerHTML = `
  <div class="page-head">
    <div><a href="#files" class="back">‹ All files</a>
      <h1>${esc(f.applicantName)} ${stageBadge(fx)}</h1>
      <p class="sub">App ID ${esc(f.appId || '–')} · Old App ID ${esc(f.oldAppId || '–')} · ${esc(f.mainLoanType || '')} · SM ${esc(f.salesManager || '–')}</p></div>
    <div class="head-actions">
      <a class="btn" href="#edit/${f.id}">Edit details</a>
      <button class="btn danger-ghost" id="del">Delete</button>
    </div>
  </div>

  <div class="kpis">
    <div class="kpi"><span>Life premium</span><b>${inr(fx.premium)}</b><small>basic ${inr(f.basicPremium)} + GST ${inr(f.gst)}</small></div>
    <div class="kpi"><span>Insurance loan</span><b>${inr(fx.loan)}</b><small>EMI ${inr(f.emi)} × ${esc(f.installments || '–')}</small></div>
    <div class="kpi"><span>Total TAT</span><b>${dur(fx.totalMs)}</b><small>${fx.closed ? 'closed' : 'still running'} · since ${fmtDate(fx.loginAt, true)}</small></div>
    <div class="kpi ${!fx.closed && days(fx.inStageMs) > s.stageBenchmarkDays ? 'alert' : ''}"><span>In current stage</span><b>${fx.closed ? '–' : dur(fx.inStageMs)}</b><small>${esc(fx.current)}</small></div>
    <div class="kpi ${fx.openQ.length ? 'alert' : ''}"><span>Queries</span><b>${fx.queries.length}</b><small>${fx.openQ.length} open</small></div>
  </div>

  <section class="card">
    <div class="card-h"><div><h2>Process status</h2><p>Stages from the Axis cover sheet and the Bajaj insurance flow. Record a stage when the file reaches it.</p></div></div>
    <ol class="stepper">
      ${s.stages.map((st, i) => {
        const h = reached.get(st);
        const cls = fx.outcome ? (h ? 'done' : 'skip') : h ? (st === fx.current && !fx.completed ? 'cur' : 'done') : i < lastIdx ? 'skip' : 'todo';
        return `<li class="${cls}"><i>${cls === 'done' ? '✓' : i + 1}</i><span>${esc(st)}</span><small>${h ? fmtDate(h.at, true) : cls === 'skip' ? 'not recorded' : ''}</small></li>`;
      }).join('')}
      ${fx.outcome ? `<li class="bad"><i>✕</i><span>${esc(fx.outcome)}</span><small>${fmtDate(reached.get(fx.outcome).at, true)}</small></li>` : ''}
    </ol>
    ${Charts.strip(fx.segments)}
    <form id="stage-form" class="inline-form">
      <label class="fld"><span>Move to stage</span><select name="stage">
        ${s.stages.map((st, i) => `<option ${i === Math.min(lastIdx + 1, s.stages.length - 1) ? 'selected' : ''}>${esc(st)}</option>`).join('')}
        <optgroup label="Close file">${OUTCOMES.map(o => `<option>${esc(o)}</option>`).join('')}</optgroup>
      </select></label>
      <label class="fld"><span>Date & time</span><input type="datetime-local" name="at" value="${nowLocalInput()}" required></label>
      <label class="fld grow"><span>Note (optional)</span><input name="note" placeholder="e.g. sent to CPC, DD handed over"></label>
      <button class="btn primary">Update stage</button>
    </form>
    <details class="history">
      <summary>Stage history (${hist.length})</summary>
      <table class="mini"><thead><tr><th>Stage</th><th>Reached on</th><th class="r">Time in stage</th><th>Note</th><th></th></tr></thead><tbody>
      ${fx.segments.map((sg, i) => `<tr><td>${esc(sg.stage)}</td><td>${fmtDate(sg.start, true)}</td><td class="r num">${sg.open ? dur(sg.ms) + ' …' : (i === fx.segments.length - 1 ? '–' : dur(sg.ms))}</td><td>${esc(hist[i].note || '')}</td>
        <td><button class="link-btn" data-del-h="${i}">remove</button></td></tr>`).join('')}
      </tbody></table>
    </details>
  </section>

  <section class="card">
    <div class="card-h"><div><h2>Queries</h2><p>Log every query: who raised it, at which stage, what it was and why, and when it was closed.</p></div>
      <button class="btn" id="add-q">+ Raise query</button></div>
    <form id="q-form" class="q-form" hidden>
      <div class="grid">
        <label class="fld"><span>Raised on <i class="req">*</i></span><input type="datetime-local" name="raisedAt" value="${nowLocalInput()}" required></label>
        <label class="fld"><span>At stage</span><select name="stage">${s.stages.map(st => `<option ${st === fx.current ? 'selected' : ''}>${esc(st)}</option>`).join('')}</select></label>
        <label class="fld"><span>Raised by</span><select name="raisedBy">${QUERY_RAISED_BY.map(o => `<option>${esc(o)}</option>`).join('')}</select></label>
        <label class="fld"><span>Category</span><select name="category">${Object.keys(QUERY_CATEGORIES).map(o => `<option>${esc(o)}</option>`).join('')}</select></label>
        <label class="fld span2"><span>What is the query? <i class="req">*</i></span><input name="description" required placeholder="e.g. Nominee DOB missing on enrollment form"></label>
        <label class="fld span3"><span>Why was it raised? (root cause)</span><input name="reason" placeholder="e.g. Customer did not have the nominee's Aadhaar at the time of login"></label>
      </div>
      <div class="form-actions"><button type="button" class="btn" id="q-cancel">Cancel</button><button class="btn primary">Save query</button></div>
    </form>
    ${fx.queries.length ? `<div class="q-list">${f.queries.slice().sort((a, b) => new Date(b.raisedAt) - new Date(a.raisedAt)).map(q => {
      const open = !q.resolvedAt;
      const ms = (open ? new Date() : new Date(q.resolvedAt)) - new Date(q.raisedAt);
      return `<div class="q-item ${open ? 'open' : ''}">
        <div class="q-top"><span class="q-pill ${open ? 'open' : ''}">${open ? 'Open' : 'Resolved'}</span>
          <b>${esc(q.description)}</b><span class="muted">${esc(q.category)} · by ${esc(q.raisedBy)} · at ${esc(q.stage)}</span></div>
        ${q.reason ? `<p><span class="muted">Why:</span> ${esc(q.reason)}</p>` : ''}
        <p class="muted">Raised ${fmtDate(q.raisedAt, true)}${open ? ` · open for <b class="${days(ms) > s.queryBenchmarkDays ? 'late' : ''}">${dur(ms)}</b>` : ` · resolved ${fmtDate(q.resolvedAt, true)} · took <b>${dur(ms)}</b>`}</p>
        ${q.resolution ? `<p><span class="muted">Resolution:</span> ${esc(q.resolution)}</p>` : ''}
        ${open ? `<form class="resolve inline-form" data-q="${q.id}">
          <label class="fld"><span>Resolved on</span><input type="datetime-local" name="resolvedAt" value="${nowLocalInput()}" required></label>
          <label class="fld grow"><span>How was it resolved?</span><input name="resolution" placeholder="e.g. Collected nominee Aadhaar and resubmitted"></label>
          <button class="btn primary">Mark resolved</button></form>` : ''}
        <button class="link-btn q-del" data-q="${q.id}">delete query</button>
      </div>`;
    }).join('')}</div>` : '<p class="muted pad">No queries on this file. 👍</p>'}
  </section>

  <section class="card">
    <div class="card-h"><div><h2>Documents</h2><p>Photos uploaded with this file (stored only in this browser).</p></div><a class="btn" href="#edit/${f.id}">+ Add photos</a></div>
    <div class="thumbs big" id="doc-thumbs"><span class="muted pad">Loading…</span></div>
  </section>

  <section class="card">
    <div class="card-h"><div><h2>File details</h2></div></div>
    <div class="kv-grid">
      ${info('Co-applicant', esc(f.coApplicantName) + (f.coApplicantRelation ? ` <span class="muted">(${esc(f.coApplicantRelation)})</span>` : ''))}
      ${info('Sales manager', esc(f.salesManager))}${info('DSA', esc(f.dsaName))}${info('Branch', esc(f.branch))}
      ${info('PAN', esc(f.pan))}${info('Mobile', esc(f.mobile))}${info('Email', esc(f.email))}
      ${info('Main loan', f.mainLoanAmount ? inr(f.mainLoanAmount) + ` · ${esc(f.mainLoanTenure)} yrs @ ${esc(f.mainLoanRate)}%` : '')}
      ${info('Sum assured', f.sumAssured ? inr(f.sumAssured) : '')}${info('Actual sum assured', f.actualSumAssured ? inr(f.actualSumAssured) : '')}
      ${info('Cover', [f.coverType, f.coverTerm ? f.coverTerm + ' yrs' : '', f.rider].filter(Boolean).map(esc).join(' · '))}
      ${info('Age / gender', [f.age, f.gender].filter(Boolean).map(esc).join(' / '))}${info('Occupation', esc(f.occupation))}
      ${info('Property insurance', f.propertyInsPremium ? inr(f.propertyInsPremium) : '')}${info('Health insurance', f.healthInsPremium ? inr(f.healthInsPremium) : '')}
      ${info('ROI', f.roi ? esc(f.roi) + '% (REPO ' + esc(f.repoRate) + ' + ' + esc(f.spread) + ')' : '')}
      ${info('Sanction date', f.sanctionDate ? fmtDate(f.sanctionDate) : '')}
      ${info('Nominee', [f.nomineeName, f.nomineeRelation].filter(Boolean).map(esc).join(' · '))}
      ${info('Medical (SMQ)', esc(f.smq))}
      <div class="kv span-all">${info('Approval no.', esc(f.approvalNo))}</div>
      <div class="kv span-all">${info('Address', esc(f.address))}</div>
      ${f.remarks ? `<div class="kv span-all">${info('Remarks', esc(f.remarks))}</div>` : ''}
    </div>
  </section>`;

  loadPhotos(f).then(list => {
    const box = $('#doc-thumbs'); if (!box) return;
    box.innerHTML = list.length ? list.map((p, i) => `<figure><img src="${p.dataUrl}" alt="${esc(p.name)}" data-view="${i}"></figure>`).join('') : '<span class="muted pad">No photos. Use "Add photos" to attach the file pages.</span>';
    $$('[data-view]', box).forEach(img => img.onclick = () => openViewer(list, +img.dataset.view));
  });

  // stage update
  $('#stage-form').onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const at = fd.get('at');
    if (fx.loginAt && new Date(at) < fx.loginAt) { toast('This date is before the login date'); return; }
    f.history = f.history || [];
    f.history.push({ stage: fd.get('stage'), at, note: fd.get('note').trim() });
    Store.upsert(f); toast('Stage updated'); renderDetail(id);
  };
  $$('[data-del-h]').forEach(b => b.onclick = () => {
    const h = hist[+b.dataset.delH];
    if (!confirm(`Remove "${h.stage}" from the history?`)) return;
    f.history = f.history.filter(x => x !== f.history.find(y => y.stage === h.stage && y.at === h.at));
    Store.upsert(f); renderDetail(id);
  });

  // queries
  const qf = $('#q-form');
  $('#add-q').onclick = () => { qf.hidden = false; qf.elements.description.focus(); };
  $('#q-cancel').onclick = () => { qf.hidden = true; };
  qf.onsubmit = e => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(qf));
    if (!fd.description.trim()) { qf.elements.description.classList.add('invalid'); return; }
    f.queries = f.queries || [];
    f.queries.push(Object.assign(fd, { id: uid(), description: fd.description.trim(), reason: fd.reason.trim(), resolvedAt: '', resolution: '' }));
    Store.upsert(f); toast('Query logged'); renderDetail(id);
  };
  $$('form.resolve').forEach(rf => rf.onsubmit = e => {
    e.preventDefault();
    const q = f.queries.find(x => x.id === rf.dataset.q);
    const fd = new FormData(rf);
    if (new Date(fd.get('resolvedAt')) < new Date(q.raisedAt)) { toast('The resolved date is before the raised date'); return; }
    q.resolvedAt = fd.get('resolvedAt'); q.resolution = fd.get('resolution').trim();
    Store.upsert(f); toast('Query resolved'); renderDetail(id);
  });
  $$('.q-del').forEach(b => b.onclick = () => {
    if (!confirm('Delete this query?')) return;
    f.queries = f.queries.filter(q => q.id !== b.dataset.q); Store.upsert(f); renderDetail(id);
  });
  $('#del').onclick = () => {
    if (!confirm(`Delete the file of ${f.applicantName}? This cannot be undone.`)) return;
    Store.remove(f.id); Extract.photos.remove(f.id); if (GH.enabled()) GH.deletePhotos(f.photoPaths); toast('File deleted'); location.hash = '#files';
  };
}

/* ---------- queries (all files) ---------- */

function renderQueries() {
  const s = Store.settings();
  const all = [];
  Store.files().forEach(f => (f.queries || []).forEach(q => all.push({ f, q, open: !q.resolvedAt,
    ms: (q.resolvedAt ? new Date(q.resolvedAt) : new Date()) - new Date(q.raisedAt) })));
  const mode = UI.qMode || 'open';
  const list = all.filter(x => mode === 'all' || (mode === 'open') === x.open)
    .sort((a, b) => a.open === b.open ? (a.open ? b.ms - a.ms : new Date(b.q.resolvedAt) - new Date(a.q.resolvedAt)) : a.open ? -1 : 1);
  const open = all.filter(x => x.open);
  const resolved = all.filter(x => !x.open);
  const avgRes = resolved.length ? resolved.reduce((a, x) => a + x.ms, 0) / resolved.length : null;

  view().innerHTML = `
  <div class="page-head"><div><h1>Queries</h1><p class="sub">All queries across your files. Tap one to open its file and resolve it.</p></div></div>
  <div class="kpis">
    <div class="kpi ${open.length ? 'alert' : ''}"><span>Open</span><b>${open.length}</b><small>${open.filter(x => days(x.ms) > s.queryBenchmarkDays).length} older than ${s.queryBenchmarkDays}d</small></div>
    <div class="kpi"><span>Resolved</span><b>${resolved.length}</b><small>avg ${avgRes != null ? dur(avgRes) : '–'} to close</small></div>
  </div>
  <div class="stage-chips">
    ${[['open', 'Open'], ['resolved', 'Resolved'], ['all', 'All']].map(([k, l]) => `<button class="chip ${mode === k ? 'on' : ''}" data-qm="${k}">${l} <b>${k === 'open' ? open.length : k === 'resolved' ? resolved.length : all.length}</b></button>`).join('')}
  </div>
  ${list.length ? `<div class="q-list flat">${list.map(({ f, q, open, ms }) => `
    <a class="q-item ${open ? 'open' : ''}" href="#file/${f.id}">
      <div class="q-top"><span class="q-pill ${open ? 'open' : ''}">${open ? 'Open ' + dur(ms) : 'Resolved in ' + dur(ms)}</span><b>${esc(q.description)}</b></div>
      <p><b>${esc(f.applicantName)}</b> <span class="muted">· ${esc(f.appId || '')} · ${esc(q.category)} · by ${esc(q.raisedBy)} · at ${esc(q.stage)}</span></p>
      ${q.reason ? `<p class="muted">Why: ${esc(q.reason)}</p>` : ''}
      ${q.resolution ? `<p class="muted">✓ ${esc(q.resolution)}</p>` : ''}
    </a>`).join('')}</div>`
  : `<div class="empty"><h3>${mode === 'open' ? 'No open queries 🎉' : 'No queries yet'}</h3><p>Queries are added from a file's page with "Raise query".</p></div>`}`;
  $$('[data-qm]').forEach(b => b.onclick = () => { UI.qMode = b.dataset.qm; renderQueries(); });
}

/* ---------- settings ---------- */

function renderSettings() {
  const s = Store.settings();
  const m = UI.month;
  const t = Store.targetFor(m);
  view().innerHTML = `
  <div class="page-head"><div><h1>Settings</h1><p class="sub">Your profile, monthly targets, process stages and data backup.</p></div></div>
  <form id="set-form" class="card-form">
    <section class="card"><div class="card-h"><div><h2>Profile</h2><p>Shown on the report header.</p></div></div>
      <div class="grid">
        <label class="fld"><span>Your name</span><input name="rmName" value="${esc(s.rmName)}"></label>
        <label class="fld"><span>Designation</span><input name="designation" value="${esc(s.designation)}"></label>
        <label class="fld"><span>Sub ID</span><input name="subId" value="${esc(s.subId)}"></label>
        <label class="fld"><span>Company / channel</span><input name="company" value="${esc(s.company)}"></label>
        <label class="fld"><span>Branch</span><input name="branch" value="${esc(s.branch)}"></label>
        <label class="fld"><span>Master policy no.</span><input name="masterPolicyNo" value="${esc(s.masterPolicyNo)}"></label>
        <label class="fld"><span>Manager name</span><input name="managerName" value="${esc(s.managerName)}"></label>
        <label class="fld"><span>Manager email</span><input name="managerEmail" type="email" value="${esc(s.managerEmail)}"></label>
      </div></section>

    ${PWA.standalone() ? '' : `<section class="card"><div class="card-h"><div><h2>Install as an app</h2>
      <p>${PWA.canInstall() ? 'Add the tracker to the home screen. It then opens full screen like a normal app and works offline.' : PWA.isIOS ? 'On iPhone: open this page in Safari, tap Share, then "Add to Home Screen".' : 'Open this page in Chrome on the phone and choose "Install app" or "Add to Home screen" from the menu.'}</p></div>
      ${PWA.canInstall() ? '<button type="button" class="btn primary" id="pwa-install">Install</button>' : ''}</div><div class="pad"></div></section>`}

    <section class="card"><div class="card-h"><div><h2>Cloud backup</h2>
      <p id="gh-status">${GH.enabled() ? '✓ Connected. Photos and files are backed up automatically' + (localStorage.getItem('avani_last_sync') ? ' · last synced ' + fmtDate(localStorage.getItem('avani_last_sync'), true) : '') + '.' : 'Not set up yet. Your files are saved on this device only.'}</p></div>
      ${GH.enabled() ? '<button type="button" class="btn" id="gh-sync">Sync now</button>' : ''}</div><div class="pad"></div></section>

    <section class="card"><div class="card-h"><div><h2>Photo reading (Claude AI)</h2>
      <p>Needed for "Fill from photos". Get a key at console.anthropic.com. The key is saved only in this browser, and photos are sent only to Anthropic's API when you click "Read documents". Check with your company that sending customer documents to an AI service is allowed.</p></div></div>
      <div class="grid">
        <label class="fld span2"><span>Claude API key</span><input name="apiKey" type="password" autocomplete="off" placeholder="sk-ant-…" value="${esc(s.apiKey || '')}"></label>
        <label class="fld"><span>Model</span><input value="${Extract.MODEL}" disabled></label>
      </div></section>

    <section class="card"><div class="card-h"><div><h2>Monthly target</h2><p>Set a target for a specific month; months without one use the default.</p></div></div>
      <div class="grid">
        <label class="fld"><span>Month</span><input type="month" name="tMonth" value="${m}"></label>
        <label class="fld"><span>Files (count)</span><input type="number" name="tFiles" value="${t.files}"></label>
        <label class="fld"><span>Life premium (₹)</span><input type="number" name="tPremium" value="${t.premium}"></label>
        <label class="fld"><span>Insurance loan amount (₹)</span><input type="number" name="tLoan" value="${t.loan}"></label>
      </div>
      <div class="grid">
        <label class="fld"><span>Default files / month</span><input type="number" name="dFiles" value="${s.defaultTargets.files}"></label>
        <label class="fld"><span>Default life premium (₹)</span><input type="number" name="dPremium" value="${s.defaultTargets.premium}"></label>
        <label class="fld"><span>Default insurance loan (₹)</span><input type="number" name="dLoan" value="${s.defaultTargets.loan}"></label>
      </div></section>

    <section class="card"><div class="card-h"><div><h2>Process & benchmarks</h2></div></div>
      <div class="grid">
        <label class="fld span3"><span>Stages in order, one per line (the last one means the file is complete)</span><textarea name="stages" rows="8">${esc(s.stages.join('\n'))}</textarea></label>
        <label class="fld"><span>Count a file as business done at</span><select name="businessStage">${s.stages.map(st => `<option ${st === s.businessStage ? 'selected' : ''}>${esc(st)}</option>`).join('')}</select></label>
        <label class="fld"><span>Target TAT, login → business (days)</span><input type="number" name="tatBenchmarkDays" value="${s.tatBenchmarkDays}"></label>
        <label class="fld"><span>Flag file as stuck after (days in one stage)</span><input type="number" name="stageBenchmarkDays" value="${s.stageBenchmarkDays}"></label>
        <label class="fld"><span>Expected query resolution (days)</span><input type="number" name="queryBenchmarkDays" value="${s.queryBenchmarkDays}"></label>
      </div></section>
    <div class="form-actions"><button class="btn primary">Save settings</button></div>
  </form>

  <section class="card"><div class="card-h"><div><h2>Backup & data</h2><p>Your data is stored only in this browser on this computer. Download a backup regularly, and use it to move to another computer.</p></div></div>
    <div class="row-actions">
      <button class="btn" id="export">Download backup (.json)</button>
      <label class="btn">Restore from backup<input type="file" id="import" accept=".json" hidden></label>
      <button class="btn" id="export-csv">Export files to Excel (.csv)</button>
      <button class="btn" id="sample">Load 3 sample files</button>
      <button class="btn danger-ghost" id="wipe">Delete all files</button>
    </div></section>

  <section class="card" id="gh-admin" hidden><div class="card-h"><div><h2>Admin: cloud backup setup</h2>
    <p>Repo: <b>${esc(APP_CONFIG.githubOwner)}/${esc(APP_CONFIG.githubRepo)}</b> (set in js/config.js). Paste a fine-grained token with access to only that private repo and <b>Contents: Read and write</b>. It is stored only on this device.</p></div></div>
    <div class="grid"><label class="fld span3"><span>GitHub access token</span><input id="gh-token" type="password" autocomplete="off" placeholder="github_pat_…" value="${esc(s.ghToken || '')}"></label></div>
    <div class="row-actions"><button type="button" class="btn primary" id="gh-save">Save & connect</button><button type="button" class="btn danger-ghost" id="gh-clear">Disconnect</button><span class="muted" id="gh-admin-status"></span></div>
  </section>
  <p class="version" id="app-version">Loan Tracker · version ${APP_CONFIG.version}</p>`;

  $('#set-form').onsubmit = e => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const stages = fd.stages.split('\n').map(x => x.trim()).filter(Boolean);
    if (stages.length < 2) { toast('Please enter at least 2 stages'); return; }
    Object.assign(s, {
      rmName: fd.rmName, designation: fd.designation, subId: fd.subId, company: fd.company, branch: fd.branch,
      masterPolicyNo: fd.masterPolicyNo, apiKey: (fd.apiKey || '').trim(), managerName: fd.managerName, managerEmail: fd.managerEmail, stages,
      businessStage: stages.includes(fd.businessStage) ? fd.businessStage : stages[stages.length - 1],
      tatBenchmarkDays: num(fd.tatBenchmarkDays) || 7, stageBenchmarkDays: num(fd.stageBenchmarkDays) || 2, queryBenchmarkDays: num(fd.queryBenchmarkDays) || 2,
      defaultTargets: { files: num(fd.dFiles), premium: num(fd.dPremium), loan: num(fd.dLoan) }
    });
    if (fd.tMonth) s.targets[fd.tMonth] = { files: num(fd.tFiles), premium: num(fd.tPremium), loan: num(fd.tLoan) };
    Store.saveSettings(s); toast('Settings saved'); renderSettings();
  };
  $('#set-form').elements.tMonth.onchange = e => {
    const tt = Store.targetFor(e.target.value); const el = $('#set-form').elements;
    el.tFiles.value = tt.files; el.tPremium.value = tt.premium; el.tLoan.value = tt.loan;
  };
  const ib = $('#pwa-install'); if (ib) ib.onclick = async () => { await PWA.install(); renderSettings(); };
  // Tap the version label 5 times to open the admin setup (keeps GitHub details out of Avani's way).
  let taps = 0, tapTimer;
  $('#app-version').onclick = () => {
    taps++; clearTimeout(tapTimer); tapTimer = setTimeout(() => { taps = 0; }, 1500);
    if (taps >= 5) { taps = 0; const p = $('#gh-admin'); p.hidden = !p.hidden; if (!p.hidden) p.scrollIntoView({ behavior: 'smooth' }); }
  };
  const adminStatus = msg => { $('#gh-admin-status').innerHTML = msg; };
  $('#gh-save').onclick = async () => {
    const ss = Store.settings(); ss.ghToken = $('#gh-token').value.trim(); Store.saveSettings(ss);
    adminStatus('<span class="spinner"></span> Checking…');
    try {
      const name = await GH.test();
      adminStatus('<span class="spinner"></span> Connected to ' + esc(name) + '. Syncing…');
      await GH.sync(); await uploadMissingPhotos(adminStatus);
      adminStatus('✓ Connected to <b>' + esc(name) + '</b> and synced.');
    } catch (e) { adminStatus('<span class="late">' + esc(e.message) + '</span>'); }
  };
  $('#gh-clear').onclick = () => { const ss = Store.settings(); ss.ghToken = ''; Store.saveSettings(ss); renderSettings(); toast('Cloud backup disconnected on this device'); };
  const gs = $('#gh-sync');
  if (gs) gs.onclick = async () => {
    const st = $('#gh-status');
    st.innerHTML = '<span class="spinner"></span> Syncing…';
    try { await GH.sync(); await uploadMissingPhotos(m => { st.innerHTML = m; }); st.innerHTML = '✓ Synced ' + fmtDate(new Date(), true); }
    catch (e) { st.innerHTML = '<span class="late">' + esc(e.message) + '</span>'; }
  };
  $('#export').onclick = () => download(`avani-files-backup-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify({ exportedAt: new Date().toISOString(), settings: Object.assign(Store.settings(), { apiKey: '', ghToken: '' }), files: Store.files() }, null, 2), 'application/json');
  $('#import').onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (!Array.isArray(d.files)) throw new Error('bad');
        if (!confirm(`Restore ${d.files.length} files from the backup? This replaces the files that are in the app now.`)) return;
        Store.saveFiles(d.files); if (d.settings) Store.saveSettings(Object.assign(d.settings, { apiKey: Store.settings().apiKey, ghToken: Store.settings().ghToken }));
        toast('Backup restored'); renderSettings();
      } catch (err) { toast('That file is not a valid backup'); }
    };
    r.readAsText(file);
  };
  $('#export-csv').onclick = exportCsv;
  $('#sample').onclick = loadSamples;
  $('#wipe').onclick = () => {
    if (!confirm('Delete ALL files from this browser? Download a backup first if you need one.')) return;
    Store.saveFiles([]); toast('All files deleted');
  };
}

async function loadPhotos(f) {
  const local = await Extract.photos.get(f.id);
  if (local.length || !(f.photoPaths || []).length || !GH.enabled()) return local;
  const list = [];
  for (const path of f.photoPaths) {
    try { list.push({ name: path.split('/').pop(), dataUrl: await GH.downloadPhoto(path), remote: path }); } catch (e) {}
  }
  if (list.length) Extract.photos.set(f.id, list).catch(() => {});
  return list;
}

function openViewer(list, i) {
  const ov = document.createElement('div'); ov.className = 'viewer';
  const show = () => { ov.innerHTML = `<img src="${list[i].dataUrl}" alt=""><button class="v-x" aria-label="Close">×</button>${list.length > 1 ? '<button class="v-prev" aria-label="Previous">‹</button><button class="v-next" aria-label="Next">›</button>' : ''}<span class="v-n">${i + 1} / ${list.length}</span>`; };
  const close = () => { ov.remove(); document.removeEventListener('keydown', key); };
  const key = e => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') { i = (i + 1) % list.length; show(); } if (e.key === 'ArrowLeft') { i = (i - 1 + list.length) % list.length; show(); } };
  ov.onclick = e => {
    if (e.target.classList.contains('v-next')) { i = (i + 1) % list.length; show(); }
    else if (e.target.classList.contains('v-prev')) { i = (i - 1 + list.length) % list.length; show(); }
    else if (e.target.tagName !== 'IMG') close();
  };
  document.addEventListener('keydown', key); show(); document.body.appendChild(ov);
}

// Push photos that only exist on this device (e.g. taken before GitHub was connected).
async function uploadMissingPhotos(report) {
  for (const f of Store.files()) {
    const local = await Extract.photos.get(f.id);
    if (!local.some(p => !p.remote)) continue;
    report && report('<span class="spinner"></span> Uploading photos of ' + esc(f.applicantName) + '…');
    const paths = await GH.uploadPhotos(f, local);
    await Extract.photos.set(f.id, local);
    const cur = Store.get(f.id); cur.photoPaths = paths; Store.upsert(cur);
  }
}

function exportCsv() {
  const s = Store.settings();
  const cols = ['applicantName', 'coApplicantName', 'appId', 'oldAppId', 'salesManager', 'dsaName', 'branch', 'mainLoanType', 'mainLoanAmount',
    'sumAssured', 'actualSumAssured', 'coverTerm', 'basicPremium', 'gst', 'totalPremium', 'propertyInsPremium', 'lifeInsPremium', 'healthInsPremium',
    'insLoanAmount', 'roi', 'installments', 'emi', 'sanctionDate'];
  const head = cols.concat(['loginAt', 'currentStage', 'totalTatDays', 'queriesTotal', 'queriesOpen']);
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [head.join(',')].concat(Store.files().map(f => {
    const fx = fileFacts(f, s);
    return cols.map(c => q(f[c])).concat([q(fx.loginAt ? fx.loginAt.toISOString() : ''), q(fx.current), q(fx.totalMs != null ? days(fx.totalMs).toFixed(1) : ''), fx.queries.length, fx.openQ.length]).join(',');
  }));
  download(`avani-files-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + lines.join('\n'), 'text/csv');
}

function download(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

document.addEventListener('DOMContentLoaded', () => {
  initTooltips(document); route();
  // Pull the latest files from GitHub on start, and whenever the app comes back to the foreground.
  const pull = () => GH.sync().then(changed => { if (changed && !/^#(new|edit)/.test(location.hash)) route(); }).catch(() => {});
  pull();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pull(); });
});
