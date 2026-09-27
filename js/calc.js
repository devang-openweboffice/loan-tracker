/* GCPP calculator: the same sheet Avani fills in Excel, calculated here and printed / saved as a PDF. */

const Calc = (() => {
  const DRAFT = 'avani_calc_draft';
  const PRODUCTS = ['Home Loan', 'LAP', 'ASHA', 'Top-up', 'Balance Transfer'];
  const RIDERS = ['None', 'ACI', 'APTPD', 'ACI + APTPD'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const today = () => new Date().toISOString().slice(0, 10);
  const blank = () => ({ name: '', sumAssured: '', financed: 'Yes', term: '', dob: '', dod: today(), cover: 'Level', mph: '591761952',
    product: 'Home Loan', rider: 'ACI + APTPD', basic: '', date: today(), uin: '116N094V07' });

  const load = () => { try { return Object.assign(blank(), JSON.parse(localStorage.getItem(DRAFT) || '{}')); } catch (e) { return blank(); } };
  const save = d => { try { localStorage.setItem(DRAFT, JSON.stringify(d)); } catch (e) {} };

  // Excel-style figures: 1,360,000
  const n0 = v => v === '' || v == null || isNaN(v) ? '' : Math.round(v).toLocaleString('en-US');
  const parts = iso => { if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return ['', '', '']; const [y, m, d] = iso.split('-'); return [d, MON[+m - 1], y]; };
  const dmy = iso => { const [d, m, y] = (iso || '').split('-').reverse(); return y ? `${d}-${m}-${y}` : ''; };

  function compute(d) {
    const sa = num(d.sumAssured), basic = num(d.basic);
    const gst = basic ? Math.round(basic * 0.18) : 0;
    const total = basic + gst;
    let age = '';
    if (d.dob && d.dod) {
      const b = new Date(d.dob), e = new Date(d.dod);
      age = e.getFullYear() - b.getFullYear() - ((e.getMonth() < b.getMonth() || (e.getMonth() === b.getMonth() && e.getDate() < b.getDate())) ? 1 : 0);
      if (age < 0 || age > 100) age = '';
    }
    return {
      gst, total, age,
      actual: sa ? sa + (d.financed === 'Yes' ? total : 0) : 0,
      finalProduct: d.product + (d.rider && d.rider !== 'None' ? ' + ' + d.rider : '')
    };
  }

  function sheet(d, c) {
    const [bd, bm, by] = parts(d.dob), [dd, dm, dy] = parts(d.dod);
    const row = (l, v, cls = '') => `<div class="gs-row"><span>${l} :</span><b class="${cls}">${v}</b></div>`;
    const date3 = (a, b, c2) => `<div class="gs-date"><i>${a}</i><i>${b}</i><i>${c2}</i></div>`;
    return `
    <div class="gcpp-sheet" id="gcpp-sheet">
      <div class="gs-top">Group Credit Protection Plus – <em>Three-in-one Coverage, One Simple Choice</em></div>
      <div class="gs-title"><h2>GCPP - Calculator</h2><span>UIN:${esc(d.uin)}</span><span>Date:-${esc(dmy(d.date))}</span></div>
      <div class="gs-body">
        <div class="gs-col">
          ${row('Customer Name', esc(d.name), 'wide')}
          ${row('Sum Assured (Rs.)', n0(num(d.sumAssured) || ''))}
          ${row('Premium Financed', esc(d.financed))}
          ${row('Term (Years)', esc(d.term))}
          <div class="gs-row"><span>DoB (DD/MM/YYYY) :</span>${date3(bd, bm, by)}</div>
          <div class="gs-row"><span>DoD (DD/MM/YYYY) :</span>${date3(dd, dm, dy)}</div>
          ${row('Cover', esc(d.cover))}
          ${row('MPH No', `<strong>${esc(d.mph)}</strong>`)}
        </div>
        <div class="gs-col">
          ${row('Product', esc(d.product))}
          ${row('Rider', esc(d.rider))}
          ${row('Final Product', esc(c.finalProduct))}
          ${row('Actual Sum Assured', `<strong>${n0(c.actual || '')}</strong>`)}
          ${row('Calculated Age (Years)', esc(c.age))}
          ${row('Basic Premium', n0(num(d.basic) || ''))}
          ${row('GST', n0(c.gst || ''))}
          ${row('Premium to be filled in App form', `<strong>${n0(c.total || '')}</strong>`)}
        </div>
      </div>
    </div>`;
  }

  /* ---------- PDF: drawn directly (phones often block the browser print screen inside an installed app) ---------- */
  let pdfLib = null;
  function loadPdf() {
    if (window.jspdf) return Promise.resolve(window.jspdf);
    if (!pdfLib) pdfLib = new Promise((ok, fail) => {
      const s = document.createElement('script'); s.src = 'vendor/jspdf.umd.min.js';
      s.onload = () => ok(window.jspdf); s.onerror = () => { pdfLib = null; fail(new Error('Could not load the PDF maker. Check the internet once and try again.')); };
      document.head.appendChild(s);
    });
    return pdfLib;
  }
  function makePdf(d, c) {
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    const X = 12, W = 186, T = 14;
    doc.setLineWidth(0.35); doc.setDrawColor(40);
    doc.setFillColor(58, 58, 58); doc.rect(X, T, W, 9, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('Group Credit Protection Plus - ', X + 3, T + 6);
    doc.setFont('times', 'italic'); doc.text('Three-in-one Coverage, One Simple Choice', X + 3 + doc.getTextWidth('Group Credit Protection Plus - ') + 1, T + 6);
    doc.setFillColor(107, 107, 107); doc.rect(X, T + 9, W, 11, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text('GCPP - Calculator', X + 3, T + 17);
    doc.setFontSize(8.5); doc.text('UIN:' + d.uin + '      Date:-' + dmy(d.date), X + W - 3, T + 17, { align: 'right' });
    doc.setTextColor(17);
    const [bd, bm, by] = parts(d.dob), [dd, dm, dy] = parts(d.dod);
    const L = [['Customer Name', d.name, 0, 1], ['Sum Assured (Rs.)', n0(num(d.sumAssured) || '')], ['Premium Financed', d.financed], ['Term (Years)', d.term],
      ['DoB (DD/MM/YYYY)', [bd, bm, by]], ['DoD (DD/MM/YYYY)', [dd, dm, dy]], ['Cover', d.cover], ['MPH No', d.mph, 1]];
    const R = [['Product', d.product], ['Rider', d.rider], ['Final Product', c.finalProduct], ['Actual Sum Assured', n0(c.actual || ''), 1],
      ['Calculated Age (Years)', String(c.age)], ['Basic Premium', n0(num(d.basic) || '')], ['GST', n0(c.gst || '')], ['Premium to be filled in App form', n0(c.total || ''), 1]];
    const col = (rows, cx) => rows.forEach(([label, v, bold, left], i) => {
      const y = T + 26 + i * 10.5, bx = cx + 42, bw = 49, bh = 7.5;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(label.length > 24 ? 8 : 9.5);
      doc.text(doc.splitTextToSize(label + ' :', 40), cx + 40, label.length > 24 ? y + 2.6 : y + 5, { align: 'right' });
      const cell = (t, x, w, b, al) => {
        doc.rect(x, y, w, bh); doc.setFont('helvetica', b ? 'bold' : 'normal');
        let fs = 10; doc.setFontSize(fs); while (fs > 6 && doc.getTextWidth(String(t || '')) > w - 2) doc.setFontSize(fs -= 0.5);
        doc.text(String(t || ''), al ? x + 1.5 : x + w / 2, y + 5.1, { align: al ? 'left' : 'center' });
      };
      if (Array.isArray(v)) v.forEach((p, j) => cell(p, bx + j * bw / 3, bw / 3)); else cell(v, bx, bw, bold, left);
    });
    col(L, X + 2); col(R, X + 95);
    doc.rect(X, T, W, 26 + 8 * 10.5 + 3);
    return doc;
  }
  async function sharePdf(d, c, mode) {
    await loadPdf();
    const name = 'GCPP-' + ((d.name || 'Calculator').trim().replace(/[^A-Za-z0-9]+/g, '-')) + '.pdf';
    const blob = makePdf(d, c).output('blob');
    const file = new File([blob], name, { type: 'application/pdf' });
    if (mode !== 'download' && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function render(fileId) {
    let d = load();
    const f = fileId ? Store.get(fileId) : null;
    if (f) {   // opened from a file: start from its GCPP values
      const rider = f.rider === 'APTD' ? 'APTPD' : f.rider === 'ACI + APTD' ? 'ACI + APTPD' : (f.rider || 'None');
      const product = PRODUCTS.find(p => (f.mainLoanType || '').startsWith(p)) || 'Home Loan';
      d = Object.assign(blank(), { name: f.applicantName || '', sumAssured: f.sumAssured || '', financed: f.premiumFinanced || 'Yes', term: f.coverTerm || '',
        dob: f.dob || '', dod: f.gcppDate || today(), cover: f.coverType || 'Level', mph: f.masterPolicyNo || '591761952', product, rider, basic: f.basicPremium || '' });
    }
    const opt = (list, v) => list.map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('');
    const inp = (k, label, type = 'text', extra = '') => `<label class="fld"><span>${label}</span><input name="${k}" type="${type}" value="${esc(d[k])}" ${type === 'number' ? 'inputmode="decimal" step="any"' : ''} ${extra}></label>`;
    const sel = (k, label, list) => `<label class="fld"><span>${label}</span><select name="${k}">${opt(list, d[k])}</select></label>`;

    view().innerHTML = `
    <div class="page-head no-print">
      <div><a href="${f ? '#file/' + f.id : '#files'}" class="back">‹ Back</a><h1>GCPP calculator</h1>
      <p class="sub">Fill it in like the Excel sheet. GST, premium, actual sum assured, age and final product are calculated. Then tap <b>Share / Print PDF</b> (choose Print, Save to Files or WhatsApp).</p></div>
      <div class="head-actions">
        <button class="btn" id="c-clear" type="button">Clear</button>
        <button class="btn" id="c-dl" type="button">Download PDF</button>
        <button class="btn primary" id="c-print" type="button">Share / Print PDF</button>
      </div>
    </div>
    <form class="card no-print" id="calc-form" autocomplete="off">
      <div class="grid">
        ${inp('name', 'Customer name')}
        ${inp('sumAssured', 'Sum assured (₹)', 'number')}
        ${sel('financed', 'Premium financed', ['Yes', 'No'])}
        ${inp('term', 'Term (years)', 'number')}
        ${inp('dob', 'Date of birth', 'date')}
        ${inp('dod', 'DoD (age is calculated on this date)', 'date')}
        ${sel('cover', 'Cover', ['Level', 'Reducing'])}
        ${sel('product', 'Product', PRODUCTS)}
        ${sel('rider', 'Rider', RIDERS)}
        <label class="fld"><span>Basic premium (₹) <i class="req">*</i></span><input name="basic" type="number" inputmode="decimal" step="any" value="${esc(d.basic)}"><small>From the Bajaj rate for this age, term and rider</small></label>
        ${inp('mph', 'MPH no.')}
        ${inp('date', 'Sheet date', 'date')}
      </div>
      <div class="calc-check">
        <span class="muted" id="c-sum"></span>
        <span class="grow"></span>
        <button class="btn" id="c-new" type="button">${f ? 'Update this file' : 'Save as new file'}</button>
      </div>
    </form>
    <div class="sheet-wrap" id="c-sheet"></div>`;

    const form = $('#calc-form');
    const read = () => Object.assign(d, Object.fromEntries(new FormData(form)));
    const paint = () => {
      read(); save(d);
      const c = compute(d);
      $('#c-sheet').innerHTML = sheet(d, c);
      $('#c-sum').innerHTML = c.total ? `Premium <b>${inr(c.total)}</b> = basic ${inr(num(d.basic))} + GST ${inr(c.gst)}${c.actual ? ` · Actual sum assured <b>${inr(c.actual)}</b>` : ''}` : 'Type the basic premium to calculate.';
    };
    form.oninput = paint; form.onchange = paint;
    paint();

    loadPdf().catch(() => {});   // ready before the tap: the share menu needs to open straight from the tap
    const pdfBtn = (id, mode) => { $(id).onclick = () => { paint(); sharePdf(d, compute(d), mode).catch(e => toast(e.message)); }; };
    pdfBtn('#c-print', 'share'); pdfBtn('#c-dl', 'download');
    $('#c-clear').onclick = () => { if (!confirm('Clear the calculator?')) return; save(blank()); location.hash = '#calc'; render(); };
    $('#c-new').onclick = () => {
      paint();
      const c = compute(d);
      const vals = {
        sumAssured: d.sumAssured, actualSumAssured: c.actual || '', coverTerm: d.term, coverType: d.cover, premiumFinanced: d.financed,
        rider: d.rider === 'APTPD' ? 'APTD' : d.rider === 'ACI + APTPD' ? 'ACI + APTD' : d.rider,
        dob: d.dob, age: c.age, gcppDate: d.dod, basicPremium: d.basic, gst: c.gst || '', totalPremium: c.total || '', lifeInsPremium: c.total || '', masterPolicyNo: d.mph
      };
      if (f) {
        const upd = Object.assign({}, f);
        for (const [k, v] of Object.entries(vals)) if (v !== '' && v != null) upd[k] = String(v);
        Store.upsert(upd); toast('File updated'); location.hash = '#file/' + f.id;
      } else {
        UI.prefill = Object.assign({ applicantName: d.name, mainLoanType: LOAN_TYPES.find(t => t.startsWith(d.product)) || '' }, vals);
        location.hash = '#new';
      }
    };
  }

  return { render, compute, _test: { makePdf, loadPdf } };
})();
