/* Data layer: settings, storage, constants, helpers. Everything lives in this browser's localStorage. */

const DB_KEY = 'avani_loan_files_v1';
const SET_KEY = 'avani_settings_v1';

// Stages follow the Axis cover-sheet flow + the Bajaj GCPP insurance steps. Editable in Settings.
const DEFAULT_STAGES = [
  'Main Loan Login',
  'KYC & Documents',
  'GCPP Calculation',
  'Enrollment Form Signed',
  'DDE',
  'Insurance Sanction',
  'Disbursal Documents',
  'Disbursal DE',
  'RAMG Request',
  'DD Printing',
  'Disbursed'
];

const OUTCOMES = ['Rejected', 'Cancelled by customer'];

const LOAN_TYPES = ['Home Loan (HL)', 'LAP', 'ASHA', 'Top-up', 'Balance Transfer', 'Other'];

const QUERY_RAISED_BY = ['Axis Credit', 'Axis CPC / Ops', 'RCU', 'Bajaj Underwriting', 'Bajaj Ops', 'Sales Manager', 'Customer', 'Other'];

// Each category carries a prevention tip used by the report's "where to improve" section.
const QUERY_CATEGORIES = {
  'KYC / PAN mismatch': 'Match the PAN, name and address with Aadhaar before the file goes in.',
  'Document missing': 'Tick the checklist before handing the file over: KYC, photo, cheque, signed GCPP printout and sanction copy.',
  'Signature missing / mismatch': 'Check every signature and date on the enrollment form (member, nominee and witness) before submitting.',
  'Medical / SMQ declaration': 'Go through the SMQ questions with the customer and write down height and weight; flag any "Yes" answers early.',
  'Premium / GCPP calc mismatch': 'Recalculate GCPP on the day of login and make sure the premium matches the life insurance figure on the sanction letter.',
  'Nominee details': 'Take the nominee name, DOB, relation and mobile before filling the form.',
  'Name / DOB mismatch': 'Copy the name and DOB exactly as they appear on PAN; recheck age on the GCPP calculator.',
  'Income proof': 'Collect salary slips or ITR and 6 months of bank statements in the first meeting.',
  'Sanction letter correction': 'Check the loan amount, tenure (months) and co-applicant name on the sanction letter before sign-off.',
  'Other': 'Note the root cause of each query so it can be prevented next time.'
};

const DEFAULT_SETTINGS = {
  rmName: 'Avani Vadodariya',
  designation: 'Sales Relationship Manager',
  subId: '7AAX057976',
  company: 'Bajaj Life Insurance – Axis Bank Bancassurance',
  branch: 'Maninagar, Ahmedabad',
  masterPolicyNo: '591761952',
  apiKey: '',
  ghToken: '',                           // GitHub token for the private data repo (repo name lives in config.js)
  managerName: '',
  managerEmail: '',
  stages: DEFAULT_STAGES.slice(),
  businessStage: 'Insurance Sanction',   // a file counts as "business done" once it reaches this stage
  tatBenchmarkDays: 7,                   // login → business stage
  stageBenchmarkDays: 2,                 // time a file may sit in one stage before it's flagged "stuck"
  queryBenchmarkDays: 2,                 // expected query resolution time
  defaultTargets: { files: 15, premium: 1000000, loan: 1500000 },
  targets: {},                           // { 'YYYY-MM': {files, premium, loan} }
  notes: {}                              // { 'YYYY-MM': 'RM note for manager' }
};

const Store = {
  files() {
    try { return JSON.parse(localStorage.getItem(DB_KEY)) || []; } catch (e) { return []; }
  },
  saveFiles(list) { localStorage.setItem(DB_KEY, JSON.stringify(list)); },
  get(id) { return this.files().find(f => f.id === id); },
  upsert(file) {
    const list = this.files();
    file.updatedAt = new Date().toISOString();
    const i = list.findIndex(f => f.id === file.id);
    if (i >= 0) list[i] = file; else list.push(file);
    this.saveFiles(list);
    if (window.GH) GH.syncSoon();
    return file;
  },
  remove(id) {
    this.saveFiles(this.files().filter(f => f.id !== id));
    if (window.GH) { GH.markDeleted(id); GH.syncSoon(); }
  },
  settings() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(SET_KEY)) || {}; } catch (e) {}
    return Object.assign({}, DEFAULT_SETTINGS, s, {
      defaultTargets: Object.assign({}, DEFAULT_SETTINGS.defaultTargets, s.defaultTargets),
      targets: s.targets || {},
      notes: s.notes || {},
      stages: (s.stages && s.stages.length) ? s.stages : DEFAULT_STAGES.slice()
    });
  },
  saveSettings(s) {
    localStorage.setItem(SET_KEY, JSON.stringify(s));
    localStorage.setItem('avani_settings_changed', new Date().toISOString());
    if (window.GH) GH.syncSoon();
  },
  targetFor(month) {
    const s = this.settings();
    return Object.assign({}, s.defaultTargets, s.targets[month]);
  }
};

/* ---------- helpers ---------- */

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const num = v => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isNaN(n) ? 0 : n; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function inr(v, compact) {
  const n = Math.round(num(v));
  if (compact) {
    if (Math.abs(n) >= 1e7) return '₹' + (n / 1e7).toFixed(2).replace(/\.?0+$/, '') + ' Cr';
    if (Math.abs(n) >= 1e5) return '₹' + (n / 1e5).toFixed(2).replace(/\.?0+$/, '') + ' L';
    if (Math.abs(n) >= 1e3) return '₹' + (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return '₹' + n.toLocaleString('en-IN');
}

const HOUR = 36e5, DAY = 864e5;

function dur(ms) {
  if (ms == null || isNaN(ms)) return '–';
  if (ms < 0) ms = 0;
  const d = Math.floor(ms / DAY), h = Math.round((ms % DAY) / HOUR);
  if (d === 0) return h <= 0 ? '< 1h' : h + 'h';
  if (d >= 10 || h === 0) return d + 'd';
  return d + 'd ' + h + 'h';
}
const days = ms => ms / DAY;

const toDate = v => v ? new Date(v) : null;
const monthKey = d => { d = toDate(d); return d ? d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') : ''; };
const thisMonth = () => monthKey(new Date());
function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}
function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}
function fmtDate(v, withTime) {
  const d = toDate(v); if (!d || isNaN(d)) return '–';
  const o = { day: '2-digit', month: 'short', year: 'numeric' };
  if (withTime) Object.assign(o, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleString('en-IN', o);
}
function nowLocalInput() {
  const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/* ---------- file-derived facts (used by list, detail and report) ---------- */

function sortedHistory(f) {
  return (f.history || []).filter(h => h.at).slice().sort((a, b) => new Date(a.at) - new Date(b.at));
}

function fileFacts(f, settings) {
  settings = settings || Store.settings();
  const stages = settings.stages;
  const hist = sortedHistory(f);
  const last = hist[hist.length - 1];
  const loginAt = hist.length ? new Date(hist[0].at) : (f.createdAt ? new Date(f.createdAt) : null);
  const current = last ? last.stage : stages[0];
  const finalStage = stages[stages.length - 1];
  const outcome = OUTCOMES.includes(current) ? current : null;
  const completed = current === finalStage;
  const closed = completed || !!outcome;
  const now = new Date();
  const endAt = closed && last ? new Date(last.at) : now;

  // Time spent in each stage = gap to the next recorded stage (the open stage runs until now).
  const segments = hist.map((h, i) => {
    const start = new Date(h.at);
    const end = hist[i + 1] ? new Date(hist[i + 1].at) : (closed ? start : now);
    return { stage: h.stage, start, end, ms: end - start, open: !hist[i + 1] && !closed };
  });

  const bizIdx = stages.indexOf(settings.businessStage);
  const bizEntry = hist.find(h => stages.indexOf(h.stage) >= bizIdx && bizIdx >= 0);
  const stageIdx = stages.indexOf(current);
  const queries = f.queries || [];
  const openQ = queries.filter(q => !q.resolvedAt);

  return {
    loginAt,
    current,
    stageIdx,
    progress: outcome ? 0 : Math.max(0, stageIdx) / (stages.length - 1),
    completed, closed, outcome,
    totalMs: loginAt ? endAt - loginAt : null,
    inStageMs: last && !closed ? now - new Date(last.at) : 0,
    segments,
    bizAt: bizEntry ? new Date(bizEntry.at) : null,
    bizMs: bizEntry && loginAt ? new Date(bizEntry.at) - loginAt : null,
    premium: num(f.lifeInsPremium) || num(f.totalPremium),
    loan: num(f.insLoanAmount),
    queries, openQ,
    queryMs: queries.filter(q => q.resolvedAt).map(q => new Date(q.resolvedAt) - new Date(q.raisedAt))
  };
}

function emi(p, annualRate, n) {
  p = num(p); n = num(n); const r = num(annualRate) / 1200;
  if (!p || !n) return 0;
  if (!r) return p / n;
  const x = Math.pow(1 + r, n);
  return p * r * x / (x - 1);
}
