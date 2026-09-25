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

/* ---------- sample data taken from the three reference files ---------- */

function sampleFiles() {
  const base = {
    branch: 'Maninagar', product: 'Insurance – Bajaj', scheme: 'GCPP', masterPolicyNo: '591761952',
    subId: '7AAX057976', coverType: 'Level', rider: 'ACI', premiumTerm: 'Single', premiumFinanced: 'Yes',
    repoRate: 5.25, queries: []
  };
  return [
    Object.assign({}, base, {
      id: uid(), salesManager: 'Ravi Patel', dsaName: 'Kalpesh',
      applicantName: 'Hansraj', coApplicantName: 'Kanchan', coApplicantRelation: 'Wife',
      oldAppId: '31293638', appId: '31701797',
      mainLoanType: 'Home Loan (HL)', mainLoanAmount: 2200000, mainLoanTenure: 20, mainLoanRate: 11,
      sumAssured: 2200000, actualSumAssured: 2366864, coverTerm: 12, age: 37, gender: 'M', occupation: 'Self-employed',
      basicPremium: 141410, gst: 25454, totalPremium: 166864,
      approvalNo: 'IN_LNPINS_FLOATING_BRE / FINNONE_31701797 / MANINAGAR ASC- / 26-27',
      spread: 5.75, roi: 11, insLoanAmount: 189175, propertyInsPremium: 22311, lifeInsPremium: 166864, healthInsPremium: 0,
      installments: 240, emi: 1953, sanctionDate: '2026-08-26',
      address: '32, Ramdev Nagar, H No 3, Opp Shakti Nagar, B/H Simla Hotel, Sarkhej, Ahmedabad – 380007',
      remarks: 'Sample from reference documents: stage dates are taken from the GCPP and sanction letter dates. Please check them.',
      history: [
        { stage: 'Main Loan Login', at: '2026-08-19T11:00', note: 'Date taken from the GCPP calculator' },
        { stage: 'GCPP Calculation', at: '2026-08-19T12:00', note: '' },
        { stage: 'Insurance Sanction', at: '2026-08-26T12:00', note: 'Sanction letter dated 26-Aug-2026' }
      ]
    }),
    Object.assign({}, base, {
      id: uid(), salesManager: 'Sunil Prajapati', dsaName: 'Nimesh',
      applicantName: 'Chauhan Anjali Sandeepsingh', coApplicantName: 'Chauhan Sandeepsingh Rajkishor', coApplicantRelation: 'Husband',
      oldAppId: '31869380', appId: '32029374',
      mainLoanType: 'LAP', mainLoanAmount: 1700000, mainLoanTenure: 10, mainLoanRate: 10.5,
      sumAssured: 1700000, actualSumAssured: 1764058, coverTerm: 5, age: 41, gender: 'F', occupation: 'Self-employed',
      basicPremium: 54287, gst: 9772, totalPremium: 64058,
      approvalNo: 'IN_LNPINS_FLOATING_BRE / FINNONE_32029374 / MANINAGAR ASC- / 26-27',
      spread: 5.25, roi: 10.5, insLoanAmount: 93362, propertyInsPremium: 29304, lifeInsPremium: 64058, healthInsPremium: 0,
      installments: 120, emi: 1260, sanctionDate: '',
      address: 'E 103 Shalin Height 2, Near Akruti Township, Opp Shrinath Residency, Narol, Ahmedabad – 382405',
      remarks: 'Sample from reference documents. The sanction date on the letter is partly cut off; please confirm it.',
      history: [
        { stage: 'Main Loan Login', at: '2026-09-23T15:50', note: 'Main loan login 23/09/26 3:50 (cover note)' },
        { stage: 'Insurance Sanction', at: '2026-09-24T12:00', note: 'Assumed date, please confirm' }
      ]
    }),
    Object.assign({}, base, {
      id: uid(), salesManager: 'Hemant Prajapati', dsaName: '',
      applicantName: 'Otwani Neel Rajeshbhai', coApplicantName: 'Otwani Shwetaben Rajeshbhai', coApplicantRelation: 'Mother',
      oldAppId: '31622517', appId: '32011516',
      mainLoanType: 'ASHA', mainLoanAmount: 1500000, mainLoanTenure: 30, mainLoanRate: 11,
      sumAssured: 1500000, actualSumAssured: 1565759, coverTerm: 20, age: 22, gender: 'M', occupation: 'Salaried',
      basicPremium: 55728, gst: 10031, totalPremium: 65759,
      approvalNo: 'IN_LNPINS_FLOATING_BRE / FINNONE_32011516 / MANINAGAR ASC- / 26-27',
      spread: 5.75, roi: 11, insLoanAmount: 98670, propertyInsPremium: 32911, lifeInsPremium: 65759, healthInsPremium: 0,
      installments: 360, emi: 940, sanctionDate: '2026-09-24',
      address: 'X4 701 Sun Rising Homes 2, Near Godrej Garden City, Jagatpur, Ahmedabad – 382470',
      remarks: 'Sample from reference documents.',
      history: [
        { stage: 'Main Loan Login', at: '2026-09-22T12:18', note: 'Main loan login 22/9/26 12:18 (cover note)' },
        { stage: 'Enrollment Form Signed', at: '2026-09-24T10:00', note: 'Form signed 24/09/2026' },
        { stage: 'Insurance Sanction', at: '2026-09-24T13:00', note: 'Sanction letter dated 24-Sep-2026' }
      ]
    })
  ].map(f => Object.assign(f, { createdAt: f.history[0].at, updatedAt: new Date().toISOString() }));
}
