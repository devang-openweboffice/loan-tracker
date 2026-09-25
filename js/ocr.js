/* Free photo reader: Tesseract OCR running on the phone itself (no account, no key, photos never leave the device).
   Reads the PRINTED pages: the Axis insurance sanction letter and the Bajaj GCPP calculator.
   Handwritten pages (cover sheet, enrollment form) are recognised but their handwriting is left for Avani to type. */

const OCR = (() => {
  const CDN = 'https://cdn.jsdelivr.net/npm/';
  const PATHS = {
    workerPath: CDN + 'tesseract.js@5.1.1/dist/worker.min.js',
    corePath: CDN + 'tesseract.js-core@5',
    langPath: CDN + '@tesseract.js-data/eng/4.0.0_best_int'
  };
  let libP, workerP, onProgress = null;

  const lib = () => libP || (libP = new Promise((res, rej) => {
    if (window.Tesseract) return res();
    const s = document.createElement('script');
    s.src = CDN + 'tesseract.js@5.1.1/dist/tesseract.min.js';
    s.onload = res;
    s.onerror = () => { libP = null; rej(new Error('Could not download the free reader. It needs internet the first time only.')); };
    document.head.appendChild(s);
  }));
  async function worker() {
    await lib();
    if (!workerP) workerP = Tesseract.createWorker('eng', 1, Object.assign({ logger: m => onProgress && onProgress(m) }, PATHS))
      .catch(e => { workerP = null; throw new Error('The free reader could not start: ' + (e.message || e)); });
    return workerP;
  }

  /* ---------- image clean-up: grayscale, enlarge, optional rotation / black-white ---------- */
  function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
  function prep(img, rotate = 0, binarize = false) {
    const scale = Math.min(2, 2400 / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
    const c = document.createElement('canvas');
    c.width = rotate % 180 ? h : w; c.height = rotate % 180 ? w : h;
    const g = c.getContext('2d');
    g.translate(c.width / 2, c.height / 2); g.rotate(rotate * Math.PI / 180); g.drawImage(img, -w / 2, -h / 2, w, h);
    g.setTransform(1, 0, 0, 1, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), p = d.data, n = c.width * c.height;
    const gray = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) gray[i] = 0.299 * p[i * 4] + 0.587 * p[i * 4 + 1] + 0.114 * p[i * 4 + 2];
    let thr = -1;
    if (binarize) {   // Otsu threshold
      const hist = new Array(256).fill(0); gray.forEach(v => hist[v]++);
      let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
      let sB = 0, wB = 0, best = 0;
      for (let t = 0; t < 256; t++) {
        wB += hist[t]; if (!wB) continue; const wF = n - wB; if (!wF) break; sB += t * hist[t];
        const v = wB * wF * (sB / wB - (sum - sB) / wF) ** 2; if (v > best) { best = v; thr = t; }
      }
    }
    for (let i = 0; i < n; i++) { const v = thr < 0 ? gray[i] : (gray[i] > thr ? 255 : 0); p[i * 4] = p[i * 4 + 1] = p[i * 4 + 2] = v; }
    g.putImageData(d, 0, 0);
    return c;
  }

  /* ---------- which page is this? ---------- */
  const SIGNS = {
    sanction: /Sanction\s*Letter|Nature\s*of\s*Facility|REPO\s*rate|Amount\s*of\s*loan|Life\s*Insurance|Instal+ment|Co-?\s*appl/gi,
    gcpp: /GCPP|Calculator|Sum\s*Assured|Premium\s*to\s*be|Basic\s*Premium|Calculated\s*Age|Product\s*:|Rider|MPH|Premium\s*Financed/gi,
    enrollment: /ENROL+MENT|Sub\s*ID|Master\s*Policy|Nominee|Questionnaire|Scheme\s*Name|Place\s*of\s*Birth|Benefit\s*Particulars|Premium\s*Paying|Nationality|Occupation|Critical\s*Il+ness|Salutation|Moratorium/gi,
    cover: /HOME\s*LOAN|SALES\s*MANAGER|DSA\s*NAME|APPLICANT\s*NAME|TELESMART|LEAD\s*ID|DISBURSAL|TEAM\s*LEADER|FINANCIAL\s*DOC|PROPERTY\s*DOC|LEGAL|TECHNICAL|PAY\s*SLIP|BANK\s*STATEMENT|RAMG|DD\s*PRINTING|EXISTING\s*CUST|LOAN\s*ACCOUNT/gi
  };
  function classify(text) {
    let type = null, score = 0;
    for (const [t, re] of Object.entries(SIGNS)) {
      const n = new Set((text.match(re) || []).map(x => x.toLowerCase().replace(/\s+/g, ''))).size;
      if (n > score) { score = n; type = t; }
    }
    return { type: score >= 2 ? type : null, score };
  }

  /* ---------- number helpers ---------- */
  function toNum(s) {
    if (s == null) return null;
    s = String(s).replace(/[,\s]/g, '');
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');   // "189.175" misread for "189,175"
    const n = parseFloat(s); return isNaN(n) ? null : n;
  }
  const lines = t => t.split('\n').map(l => l.trim()).filter(Boolean);
  // Number that follows a label closely on the same line (e.g. "Amount of loan 189,175").
  function near(text, label, { exclude, maxGap = 8 } = {}) {
    for (const l of lines(text)) {
      if (exclude && exclude.test(l)) continue;
      const m = l.match(label); if (!m) continue;
      const rest = l.slice(m.index + m[0].length);
      const n = rest.match(new RegExp(`^[^\\d]{0,${maxGap}}(\\d[\\d,.]*\\d|\\d)`));
      if (n) return toNum(n[1]);
    }
    return null;
  }
  // Last number on the line (for labels followed by long text, like the EMI line).
  function lastOn(text, label) {
    for (const l of lines(text)) {
      if (!label.test(l)) continue;
      const all = l.match(/\d[\d,.]*\d|\d/g); if (all) return toNum(all[all.length - 1]);
    }
    return null;
  }
  const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
  const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const cleanName = s => (s || '').replace(/^(MRS?|MS|MISS|SHRI|SMT|DR)\.?\s+/i, '').replace(/[^A-Za-z .]/g, ' ').replace(/\s+/g, ' ').replace(/[ .]+$/, '').trim();
  const titleCase = s => s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());

  /* ---------- page parsers ---------- */
  function parseSanction(t, out, unsure) {
    const put = (k, v) => { if (v != null && v !== '' && out[k] == null) out[k] = v; };
    const id = t.match(/FINNONE[\s_.:-]*(\d{7,9})\b/i) || t.match(/\b(3\d{7})\b/);
    put('appId', id && id[1]);
    const apv = lines(t).find(l => /LNPINS|FINNONE/i.test(l));
    if (apv && out.approvalRaw == null) out.approvalRaw = apv;
    const dm = t.match(/\b(\d{1,2})\s*-\s*([A-Z]{3})\s*-\s*(20\d\d)\b/i);
    const nowY = new Date().getFullYear();
    if (dm && MONTHS[dm[2].toUpperCase()] && Math.abs(+dm[3] - nowY) <= 1) put('sanctionDate', iso(dm[3], MONTHS[dm[2].toUpperCase()], dm[1]));

    put('repoRate', near(t, /REPO\s*rate\s*\(%\)/i));
    put('spread', near(t, /Spread\s*\(%\)/i, { exclude: /\+/ }));
    put('roi', near(t, /REPO\s*rate\s*\+\s*Spread\s*\(%\)\s*p\.?\s*a\.?/i, { maxGap: 4 }));
    put('insLoanAmount', near(t, /Amount\s*of\s*loan/i));
    put('propertyInsPremium', near(t, /Prop\w*\s*Insurance/i));
    put('lifeInsPremium', near(t, /Life\s*Insurance\.?/i, { maxGap: 4 }));
    put('healthInsPremium', near(t, /Health\s*Insurance/i, { maxGap: 4 }));
    put('installments', near(t, /No\.?\s*of\s*monthly\s*Instal+ment\/?s?/i));
    put('emi', lastOn(t, /Instal+ment\s*\(?\s*EMI/i));

    const co = t.match(/Name\s*of\s*Co-?\s*appl\.?\s*([A-Z][A-Z .]{2,})/i);
    if (co) put('coApplicantName', titleCase(cleanName(co[1])));
    // Applicant: the capital-letters line just after the letter date.
    const ls = lines(t), di = ls.findIndex(l => /(\d{1,2}\s*-\s*)?[A-Z]{3}\s*-\s*20\d\d/i.test(l));
    for (let i = di + 1; di >= 0 && i < Math.min(ls.length, di + 3); i++) {
      const cand = cleanName(ls[i]);
      if (!/address|dear|sir|madam|landmark/i.test(ls[i]) && /^[A-Z .]{5,}$/.test(ls[i].replace(/^[^A-Za-z]+/, '').replace(/[^A-Za-z .]/g, '')) && cand.length >= 4) {
        put('applicantName', titleCase(cand)); unsure.add('applicantName'); break;
      }
    }
    const addr = t.match(/Address\s*:?\s*([^\n]{10,})/i);
    if (addr && out.address == null) { out.address = addr[1].replace(/\s+/g, ' ').trim(); unsure.add('address'); }
  }

  function parseGcpp(t, out, unsure) {
    const cust = t.match(/Customer\s*Name\s*:?\s*([A-Za-z][A-Za-z .]{2,}?)(?=\s{2,}|\s*Product|\s*\||$)/im);
    if (cust && !out.applicantName) { out.applicantName = titleCase(cleanName(cust[1])); unsure.add('applicantName'); }
    const set = (k, v, ok = () => true) => { if (v != null && out[k] == null && ok(v)) out[k] = v; };
    set('sumAssured', near(t, /Sum\s*Assured\s*\(?Rs\.?\)?\s*:?/i), v => v >= 10000);
    set('actualSumAssured', near(t, /Actual\s*Sum\s*Ass\w*\s*:?/i), v => v >= 10000);
    set('coverTerm', near(t, /Term\s*\(\s*Years\s*\)\s*:?/i), v => v >= 1 && v <= 40);
    set('age', near(t, /Age\s*\(\s*Years\s*\)\s*:?/i), v => v >= 18 && v <= 80);
    set('basicPremium', near(t, /Basic\s*Premium\s*:?/i), v => v >= 100);
    set('gst', near(t, /\bG[Ss5][Tt]\s*:?/), v => v >= 10);
    set('totalPremium', near(t, /Premium\s*to\s*be\s*fil+ed\s*in\s*App\s*form\s*:?/i, { maxGap: 6 }), v => v >= 100);
    const prod = t.match(/Product\s*:?\s*\|?\s*(Home\s*Loan|LAP|ASHA|Top\s*-?\s*up)/i);
    if (prod && !out.mainLoanType) out.mainLoanType = /home/i.test(prod[1]) ? 'Home Loan (HL)' : /top/i.test(prod[1]) ? 'Top-up' : prod[1].toUpperCase();
    const rider = t.match(/Rider\s*:?\s*\|?\s*(ACI|APTD|None)\b/i); if (rider) out.rider = rider[1].toUpperCase() === 'NONE' ? 'None' : rider[1].toUpperCase();
    const cover = t.match(/Cover\s*:?\s*\|?\s*(Level|Reducing)/i); if (cover) out.coverType = cover[1][0].toUpperCase() + cover[1].slice(1).toLowerCase();
    const fin = t.match(/Premium\s*Financed\s*:?\s*\|?\s*(Yes|No)\b/i); if (fin) out.premiumFinanced = fin[1][0].toUpperCase() + fin[1].slice(1).toLowerCase();
    const mph = t.match(/\b(59\d{7})\b/); if (mph) out.masterPolicyNo = mph[1];
    const dob = t.match(/DoB[^\n]*?\b(\d{1,2})\W{1,4}([A-Za-z]{3})\W{1,4}(\d{4})/i);
    if (dob && MONTHS[dob[2].toUpperCase()]) { out.dob = iso(dob[3], MONTHS[dob[2].toUpperCase()], dob[1]); unsure.add('dob'); }
  }

  /* ---------- cross-checks: fill gaps and fix OCR slips using the documents' own maths ---------- */
  function reconcile(o, unsure) {
    const close = (a, b, tol = 1) => a != null && b != null && Math.abs(a - b) <= tol;
    // Rates must be realistic. OCR sometimes drops the decimal point ("5.25" → "525"): put it back, or drop the value.
    const rate = (k, lo, hi) => {
      const v = o[k]; if (v == null) return;
      if (v >= lo && v <= hi) return;
      const fixed = [100, 10].map(d => v / d).find(x => x >= lo && x <= hi);
      if (fixed != null) { o[k] = Math.round(fixed * 100) / 100; unsure.add(k); } else delete o[k];
    };
    rate('repoRate', 3, 10); rate('spread', 0, 10); rate('roi', 5, 20);
    if (o.age != null && (o.age < 18 || o.age > 80)) delete o.age;
    if (o.coverTerm != null && (o.coverTerm < 1 || o.coverTerm > 40)) delete o.coverTerm;
    if (o.totalPremium == null && o.lifeInsPremium != null) o.totalPremium = o.lifeInsPremium;
    if (o.lifeInsPremium == null && o.totalPremium != null) o.lifeInsPremium = o.totalPremium;
    if (o.totalPremium != null && o.basicPremium == null) { o.basicPremium = Math.round(o.totalPremium / 1.18); unsure.add('basicPremium'); }
    if (o.totalPremium != null && o.basicPremium != null && o.gst == null) o.gst = o.totalPremium - o.basicPremium;
    if (o.basicPremium != null && o.gst != null && o.totalPremium != null && !close(o.basicPremium + o.gst, o.totalPremium, 2))
      ['basicPremium', 'gst', 'totalPremium'].forEach(k => unsure.add(k));
    // property + life + health = loan: the loan and life amounts are the most reliable lines
    const health = o.healthInsPremium || 0;
    if (o.insLoanAmount != null && o.lifeInsPremium != null) {
      const expected = o.insLoanAmount - o.lifeInsPremium - health;
      if (expected >= 0 && !close(o.propertyInsPremium, expected)) { o.propertyInsPremium = expected; unsure.add('propertyInsPremium'); }
    } else if (o.insLoanAmount == null && o.propertyInsPremium != null && o.lifeInsPremium != null) o.insLoanAmount = o.propertyInsPremium + o.lifeInsPremium + health;
    if (o.repoRate != null && o.spread != null) {
      const roi = Math.round((o.repoRate + o.spread) * 100) / 100;
      if (!close(o.roi, roi, 0.01)) { if (o.roi != null) unsure.add('roi'); o.roi = roi; }
    }
    if (o.roi != null && o.spread != null && o.repoRate == null) o.repoRate = Math.round((o.roi - o.spread) * 100) / 100;
    if (o.roi != null && o.repoRate != null && o.spread == null) o.spread = Math.round((o.roi - o.repoRate) * 100) / 100;
    if (o.installments != null && (o.installments < 12 || o.installments > 480)) { delete o.installments; }
    // number of EMIs from EMI = P·r(1+r)^n / ((1+r)^n − 1), rounded to whole years
    if (o.installments == null && o.emi && o.insLoanAmount && o.roi) {
      const r = o.roi / 1200, x = 1 - r * o.insLoanAmount / o.emi;
      if (x > 0) { const n = Math.round(-Math.log(x) / Math.log(1 + r)); if (n >= 12 && n <= 480) { o.installments = Math.round(n / 12) * 12; unsure.add('installments'); } }
    }
    if (o.installments != null && o.installments % 12 === 0) o.mainLoanTenure = o.installments / 12;
    if (o.sumAssured == null && o.actualSumAssured != null && o.totalPremium != null) { o.sumAssured = o.actualSumAssured - o.totalPremium; unsure.add('sumAssured'); }
    if (o.actualSumAssured == null && o.sumAssured != null && o.totalPremium != null && o.premiumFinanced !== 'No') o.actualSumAssured = o.sumAssured + o.totalPremium;
    if (o.sumAssured != null && o.mainLoanAmount == null) { o.mainLoanAmount = o.sumAssured; unsure.add('mainLoanAmount'); }
    // Approval no. rebuilt in the bank's format around the App ID (OCR often garbles this line)
    if (o.approvalRaw) {
      const raw = o.approvalRaw.toUpperCase();
      const branch = (raw.match(/\/\s*([A-Z]{4,})\s*AS/) || [])[1];
      const fy = raw.match(/(\d{2})\s*[-\s]\s*(\d{2})\s*$/);
      o.approvalNo = o.appId
        ? `IN_LNPINS_FLOATING_BRE / FINNONE_${o.appId}${branch ? ` / ${branch} ASC-` : ''}${fy ? ` / ${fy[1]}-${fy[2]}` : ''}`
        : o.approvalRaw.replace(/\s+/g, ' ').trim();
      unsure.add('approvalNo');
      delete o.approvalRaw;
    }
  }

  /* ---------- main entry: photos → same shape as the form fields ---------- */
  async function read(photos, progress) {
    const say = msg => progress && progress(msg);
    say('Starting the free reader… (the first time it downloads about 7 MB)');
    onProgress = m => { if (m.status && /load|init/i.test(m.status) && m.progress != null) say(`Preparing the reader… ${Math.round(m.progress * 100)}%`); };
    const w = await worker();
    onProgress = null;
    const out = { _notes: [] }, unsure = new Set(), found = [];
    const names = { sanction: 'sanction letter', gcpp: 'GCPP calculator', enrollment: 'enrollment form', cover: 'cover sheet' };

    for (let i = 0; i < photos.length; i++) {
      const img = await loadImg(photos[i].dataUrl);
      let best = { score: -1 };
      for (const rot of [0, 270, 90]) {
        say(`Reading photo ${i + 1} of ${photos.length}${rot ? ' (trying it turned sideways)' : ''}…`);
        const { data } = await w.recognize(prep(img, rot));
        const c = classify(data.text);
        if (c.score > best.score) best = Object.assign(c, { text: data.text, rot });
        if (c.score >= 3 || (c.score >= 2 && rot === 0)) break;
      }
      if (!best.type) { out._notes.push(`Photo ${i + 1} could not be recognised (handwritten or blurry). Fill its details yourself.`); continue; }
      found.push(names[best.type]);
      if (best.type === 'sanction' || best.type === 'gcpp') {
        const parse = best.type === 'sanction' ? parseSanction : parseGcpp;
        parse(best.text, out, unsure);
        // second reading, combined with the first: the original photo for the letter,
        // a black-and-white version for the low-contrast calculator printout
        say(`Reading photo ${i + 1} of ${photos.length} again for more detail…`);
        const second = best.type === 'sanction' ? (best.rot ? prep(img, best.rot) : img) : prep(img, best.rot, true);
        const { data } = await w.recognize(second);
        parse(data.text, out, unsure);
      }
    }
    reconcile(out, unsure);

    const handwritten = found.filter(f => f === 'cover sheet' || f === 'enrollment form');
    if (handwritten.length) out._notes.push(`The ${handwritten.join(' and ')} ${handwritten.length > 1 ? 'are' : 'is'} handwritten: please type the sales manager, DSA, PAN, mobile and nominee yourself.`);
    const result = {};
    for (const [k, v] of Object.entries(out)) if (k[0] !== '_' && v != null && v !== '') result[k] = String(v);
    result.documentsFound = [...new Set(found)];
    result.uncertainFields = [...unsure].filter(k => result[k] != null);
    result.notes = out._notes.join(' ');
    return result;
  }

  return { read, _test: { classify, parseSanction, parseGcpp, reconcile, prep } };
})();
