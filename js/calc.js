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
      <p class="sub">Fill it in like the Excel sheet. GST, premium, actual sum assured, age and final product are calculated. Then tap <b>Print / Save PDF</b>.</p></div>
      <div class="head-actions">
        <button class="btn" id="c-clear" type="button">Clear</button>
        <button class="btn primary" id="c-print" type="button">Print / Save PDF</button>
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

    $('#c-print').onclick = () => {
      paint();
      document.title = 'GCPP-' + (d.name || 'Calculator').trim().replace(/\s+/g, '-');
      document.body.classList.add('print-calc');
      window.print();
      setTimeout(() => { document.body.classList.remove('print-calc'); document.title = 'Avani · Loan Insurance Tracker'; }, 500);
    };
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

  return { render, compute };
})();
