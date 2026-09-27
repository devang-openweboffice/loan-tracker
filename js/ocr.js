/* Free photo reader: PaddleOCR (PP-OCRv5, official @paddleocr/paddleocr-js npm package) running on the phone itself.
   No account, no key, no cost; photos never leave the device. The engine + models (~45 MB) are served from this app
   (app/vendor/, built by ../ocr-build) and downloaded once, then cached for offline use.
   Reads the printed sanction letter and GCPP calculator well, and picks up what it can from handwritten pages
   (PAN, App IDs, tenure, sales manager); handwriting-based values are always marked for checking. */

const OCR = (() => {
  const VENDOR = new URL('vendor/', document.baseURI).href;
  let engineP = null;

  function engine(say) {
    if (!engineP) engineP = (async () => {
      say('Loading the photo reader… (first time only: about 45 MB, Wi-Fi recommended)');
      const { PaddleOCR } = await import(VENDOR + 'paddleocr.bundle.mjs');
      say('Preparing the reader…');
      return PaddleOCR.create({
        textDetectionModelName: 'PP-OCRv5_mobile_det', textDetectionModelAsset: { url: VENDOR + 'models/PP-OCRv5_mobile_det_onnx_infer.tar' },
        textRecognitionModelName: 'PP-OCRv5_mobile_rec', textRecognitionModelAsset: { url: VENDOR + 'models/PP-OCRv5_mobile_rec_onnx_infer.tar' },
        ortOptions: { backend: 'wasm', wasmPaths: VENDOR + 'ort/', numThreads: 1 }
      });
    })().catch(e => { engineP = null; throw new Error('The photo reader could not start (' + (e && e.message || e) + '). It needs internet the first time.'); });
    return engineP;
  }

  /* ---------- images ---------- */
  function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
  // Rotated copy (for pages photographed sideways), at most 1600px on the long side.
  function prep(img, rotate = 0) {
    const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
    const c = document.createElement('canvas');
    c.width = rotate % 180 ? h : w; c.height = rotate % 180 ? w : h;
    const g = c.getContext('2d');
    g.translate(c.width / 2, c.height / 2); g.rotate(rotate * Math.PI / 180); g.drawImage(img, -w / 2, -h / 2, w, h);
    return c;
  }

  // PaddleOCR returns separate text boxes; join boxes on the same row (left → right) into lines,
  // so "Sum Assured (Rs.) :" and "2,100,000" become one line the parsers understand.
  function toText(items) {
    const P = p => Array.isArray(p) ? { x: p[0], y: p[1] } : p;
    const boxes = items.filter(i => i && i.text && i.text.trim() && i.poly).map(i => {
      const pts = (i.poly.points || i.poly).map(P), xs = pts.map(p => p.x), ys = pts.map(p => p.y);
      return { t: i.text.trim(), x: Math.min(...xs), y: (Math.min(...ys) + Math.max(...ys)) / 2, h: Math.max(8, Math.max(...ys) - Math.min(...ys)) };
    }).sort((a, b) => a.y - b.y);
    const rows = [];
    for (const b of boxes) {
      const r = rows.find(r => Math.abs(r.y - b.y) < Math.min(r.h, b.h) * 0.6);
      if (r) { r.items.push(b); r.y = (r.y * (r.items.length - 1) + b.y) / r.items.length; } else rows.push({ y: b.y, h: b.h, items: [b] });
    }
    return rows.sort((a, b) => a.y - b.y).map(r => r.items.sort((a, b) => a.x - b.x).map(b => b.t).join(' ')).join('\n');
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
    const cust = t.match(/Customer\s*Name\s*:?\s*([A-Za-z][A-Za-z .]{2,}?)(?=\s+[A-Za-z]+\s*:|\s{2,}|\s*\||$)/im);
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
    const rider = t.match(/Rider\s*:?\s*\|?\s*(AC[IL1]\s*\+\s*APTP?D|APTP?D|AC[IL1]|No(?:ne)?)\b/i);
    if (rider && out.rider == null) { const v = rider[1].toUpperCase(); out.rider = /\+/.test(v) ? 'ACI + APTD' : /APT/.test(v) ? 'APTD' : /^NO/.test(v) ? 'None' : 'ACI'; }
    const cover = t.match(/Cover\s*:?\s*\|?\s*(Level|Reducing)/i); if (cover) out.coverType = cover[1][0].toUpperCase() + cover[1].slice(1).toLowerCase();
    const fin = t.match(/Premium\s*Financed\s*:?\s*\|?\s*(Yes|No)\b/i); if (fin) out.premiumFinanced = fin[1][0].toUpperCase() + fin[1].slice(1).toLowerCase();
    const mph = t.match(/\b((?:59|37)\d{7})\b/);
    if (mph && out.masterPolicyNo == null) {
      out.masterPolicyNo = mph[1];
      if (!['591761952', '591761890', '372507477', '372507985'].includes(mph[1])) unsure.add('masterPolicyNo');
    }
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

  /* ---------- handwritten pages: only the reliable patterns, always marked for checking ---------- */
  const lev = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length]; };
  const squash = s => (s || '').toLowerCase().replace(/[^a-z]/g, '');
  // "Ravl. patel" → "Ravi Patel" when it is close to a sales manager she already works with
  function matchName(raw, known) {
    const r = squash(raw); if (r.length < 4) return null;
    let best = null, bestScore = 0;
    for (const k of known) { const s = 1 - lev(r, squash(k)) / Math.max(r.length, squash(k).length); if (s > bestScore) { best = k; bestScore = s; } }
    return bestScore >= 0.72 ? best : null;
  }
  function parsePan(t) {
    // PAN = 5 letters, 4 digits, 1 letter; handwriting often has a gap ("BUKPT 1068G")
    const m = t.replace(/[.:]/g, ' ').match(/\b([A-Z]{5})\s?([0-9]{4})\s?([A-Z])\b/); return m ? m[1] + m[2] + m[3] : null;
  }
  function parseCover(t, out, unsure, known) {
    const put = (k, v) => { if (v != null && v !== '' && out[k] == null) { out[k] = v; unsure.add(k); } };
    put('pan', parsePan(t.toUpperCase()));
    // Old App ID: handwritten digits often come out split ("3166 7873"); join them, but only accept exactly 8 digits
    const oldM = t.match(/OLD\s*APP\.?\s*[IT1l|]?\s*[DT]?\s*[:.;\-]*\s*([\d][\d\s.]{6,12}\d)/i);
    const oldDigits = oldM ? oldM[1].replace(/\D/g, '') : '';
    const old = oldDigits.length === 8 ? [null, oldDigits] : null;
    if (old) put('oldAppId', old[1]);
    const ids = lines(t).filter(l => !/OLD/i.test(l)).join(' ').match(/(?:^|\D)(3\d{7})(?!\d)/g) || [];
    const clean = ids.map(x => x.replace(/\D/g, '')).filter(x => !old || x !== old[1]);
    if (clean.length) put('appId', clean[clean.length - 1]);
    const mon = t.match(/\b(\d{2,3})\s*M[OA0]U?N?TH/i), yrs = t.match(/\b(\d{1,2})\s*YEAR/i);
    if (mon && +mon[1] >= 12 && +mon[1] <= 480) { put('installments', +mon[1]); if (+mon[1] % 12 === 0) put('mainLoanTenure', +mon[1] / 12); }
    else if (yrs && +yrs[1] >= 1 && +yrs[1] <= 40) { put('mainLoanTenure', +yrs[1]); put('installments', +yrs[1] * 12); }
    // Applicant / co-applicant: "APPLICANT NAME: Thakor Ajaybhai  CO-APPLICANT NAME: Thakor Sejalben"
    // with the handwriting continuing on the next row: "CONTACT NO (R) Mangaji (O): Ajaybhai"
    const L = lines(t), ai = L.findIndex(l => /CO-?\s*APPLICANT\s*NAME/i.test(l));
    if (ai >= 0) {
      const row = L[ai], next = L[ai + 1] || '';
      const words = s => (s || '').replace(/[^A-Za-z .]/g, ' ').replace(/\s+/g, ' ').trim();
      const labelFree = s => words(s).split(' ').filter(w => w.length > 1 && !/^(NAME|APPLICANT|CANT|LICANT|CONTACT|NO|R|O)$/i.test(w)).join(' ');
      const coPart = labelFree(row.split(/CO-?\s*APPLICANT\s*NAME\s*:?/i)[1]);
      const apPart = labelFree(row.split(/CO-?\s*APPLICANT/i)[0].replace(/.*NAME\s*:?/i, ''));
      const nm = next.match(/\(R\)\s*(.*?)\s*(?:\(O\)|\bO\)|$)\s*:?\s*(.*)$/i);
      const apMore = nm ? labelFree(nm[1]) : '', coMore = nm ? labelFree(nm[2]) : '';
      const title = s => s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).trim();
      if (coPart.length >= 3) put('coApplicantName', title([coPart, coMore].filter(Boolean).join(' ')));
      if (apPart.length >= 3) put('applicantName', title([apPart, apMore].filter(Boolean).join(' ')));
    }
    const rate = t.match(/RATE[^\n%]{0,12}?(\d{1,2}(?:\.\d{1,2})?)\s*%/i) || t.match(/\b(\d{1,2}(?:\.\d{1,2})?)\s*%/);
    if (rate && +rate[1] >= 5 && +rate[1] <= 20) put('roi', +rate[1]);
    for (const l of lines(t)) {
      if (/MANAGER/i.test(l)) { const v = l.replace(/.*MANAGER\s*:?/i, '').replace(/TEAM\s*LEADER.*/i, ''); put('salesManager', matchName(v, known)); }
    }
    if (out.salesManager == null) for (const l of lines(t)) { const m = matchName(l, known); if (m) { put('salesManager', m); break; } }
  }
  function parseEnrollment(t, out, unsure) {
    const put = (k, v) => { if (v != null && v !== '' && out[k] == null) { out[k] = v; unsure.add(k); } };
    put('pan', parsePan(t.toUpperCase()));
    const phones = (t.replace(/\*[^*\n]*\*/g, ' ').match(/(?<![\d*])[6-9]\d{9}(?![\d*])/g) || []);   // skip the form's barcode (*619…*)
    if (phones[0]) put('mobile', phones[0]); if (phones[1]) put('nomineeMobile', phones[1]);
    const mail = t.match(/[A-Za-z0-9._-]{3,}\s*@\s*g\s*m\s*a\s*[i1l]\s*l\s*\.\s*c\s*o\s*m/i); if (mail) put('email', mail[0].replace(/\s+/g, '').replace(/@gma[1l]l/i, '@gmail').toLowerCase());
  }

  /* ---------- main entry: photos → same shape as the form fields ---------- */
  async function read(photos, progress, opts = {}) {
    const say = msg => progress && progress(msg);
    const ocr = await engine(say);
    const known = opts.knownSalesManagers || [];
    const out = { _notes: [] }, unsure = new Set(), found = [];
    const names = { sanction: 'sanction letter', gcpp: 'GCPP calculator', enrollment: 'enrollment form', cover: 'cover sheet' };

    const pages = [];
    for (let i = 0; i < photos.length; i++) {
      // full-quality original when it was just picked (sharper text), otherwise the saved copy
      const img = photos[i].file ? await createImageBitmap(photos[i].file).catch(() => loadImg(photos[i].dataUrl)) : await loadImg(photos[i].dataUrl);
      say(`Reading photo ${i + 1} of ${photos.length}… about 30–60 seconds`);
      let [res] = await ocr.predict(prep(img, 0));
      let text = toText(res.items || []), c = classify(text), best = Object.assign(c, { text });
      // sideways photo? (most text boxes taller than wide) → turn it, instead of blind retries
      const tall = (res.items || []).filter(it => { const P = (it.poly.points || it.poly).map(p => Array.isArray(p) ? p : [p.x, p.y]);
        const w = Math.max(...P.map(p => p[0])) - Math.min(...P.map(p => p[0])), h = Math.max(...P.map(p => p[1])) - Math.min(...P.map(p => p[1])); return h > w * 1.5; }).length;
      const sideways = (res.items || []).length > 3 && tall / res.items.length > 0.35;
      // not recognised upright, or looks sideways → turn it (upright photos that are recognised need no extra pass)
      if (!c.type || (c.score < 3 && sideways)) {
        for (const rot of [90, 270]) {
          say(`Photo ${i + 1} is sideways, turning it…`);
          [res] = await ocr.predict(prep(img, rot));
          text = toText(res.items || []); c = classify(text);
          if (c.score > best.score) best = Object.assign(c, { text });
          if (c.score >= 3) break;
        }
      }
      if (!best.type) { out._notes.push(`Photo ${i + 1} could not be recognised. Try a sharper, straight photo.`); continue; }
      pages.push(best);
    }
    // printed bank documents first, handwriting last: printed values always win
    const ORDER = ['sanction', 'gcpp', 'cover', 'enrollment'];
    pages.sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
    for (const p of pages) {
      found.push(names[p.type]);
      if (p.type === 'sanction') parseSanction(p.text, out, unsure);
      if (p.type === 'gcpp') { parseGcpp(p.text, out, unsure); parseGcppDate(p.text, out); }
      if (p.type === 'cover') parseCover(p.text, out, unsure, known);
      if (p.type === 'enrollment') parseEnrollment(p.text, out, unsure);
    }
    reconcile(out, unsure);

    if (found.some(f => f === 'cover sheet' || f === 'enrollment form'))
      out._notes.push('Handwritten pages were read as far as possible; those values are marked orange. Please check them, and type the names, DSA and nominee.');
    const result = {};
    for (const [k, v] of Object.entries(out)) if (k[0] !== '_' && v != null && v !== '') result[k] = String(v);
    result.documentsFound = [...new Set(found)];
    result.uncertainFields = [...unsure].filter(k => result[k] != null);
    result.notes = out._notes.join(' ');
    result.valuesRead = Object.keys(result).filter(k => !['documentsFound', 'uncertainFields', 'notes'].includes(k)).length;
    return result;
  }
  function parseGcppDate(t, out) {
    const m = t.match(/DoD[^\n]*?\b(\d{1,2})\W{1,4}([A-Za-z]{3})\W{1,4}(\d{4})/i);
    if (m && MONTHS[m[2].toUpperCase()] && out.gcppDate == null) out.gcppDate = iso(m[3], MONTHS[m[2].toUpperCase()], m[1]);
  }

  return { read, _test: { classify, parseSanction, parseGcpp, parseCover, parseEnrollment, reconcile, toText, prep, matchName } };
})();
