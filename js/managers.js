/* Axis sales-manager performance: who sends how much insurance business, and whom to push. */

const Managers = (() => {
  const INACTIVE_DAYS = 21;

  // "sunil  prajapati" and "Sunil Prajapati" are the same person.
  const keyOf = name => (name || '').trim().replace(/\s+/g, ' ').toLowerCase() || '(not set)';
  const range = m => { const [y, mo] = m.split('-').map(Number); return [new Date(y, mo - 1, 1), new Date(y, mo, 1)]; };
  const inM = (d, m) => { if (!d) return false; const [a, b] = range(m); return d >= a && d < b; };
  const sum = (arr, fn) => arr.reduce((a, x) => a + fn(x), 0);
  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  function compute(m) {
    const s = Store.settings();
    const all = Store.files().map(f => ({ f, fx: fileFacts(f, s) }));
    const months = [-5, -4, -3, -2, -1, 0].map(d => shiftMonth(m, d));
    const prevM = shiftMonth(m, -1);
    const [, monthEnd] = range(m);
    const asOf = m === thisMonth() ? new Date() : new Date(monthEnd - 1);

    const groups = new Map();
    all.forEach(x => {
      const k = keyOf(x.f.salesManager);
      if (!groups.has(k)) groups.set(k, { key: k, names: {}, items: [] });
      const g = groups.get(k);
      const n = (x.f.salesManager || '(not set)').trim().replace(/\s+/g, ' ');
      g.names[n] = (g.names[n] || 0) + 1;
      g.items.push(x);
    });

    const rows = [...groups.values()].map(g => {
      const name = Object.entries(g.names).sort((a, b) => b[1] - a[1])[0][0];
      const items = g.items.filter(x => x.fx.loginAt && x.fx.loginAt < monthEnd);   // nothing from the future
      const per = mk => {
        const logged = items.filter(x => inM(x.fx.loginAt, mk));
        const booked = items.filter(x => inM(x.fx.bizAt, mk));
        return { m: mk, logged: logged.length, booked: booked.length, premium: sum(booked, x => x.fx.premium), loan: sum(booked, x => x.fx.loan), loggedItems: logged, bookedItems: booked };
      };
      const trend = months.map(per);
      const cur = trend[5], prev = trend[4];
      // Conversion and query rate over the last 3 months: steadier than one month.
      const last3 = items.filter(x => months.slice(3).some(mk => inM(x.fx.loginAt, mk)));
      const conv = last3.length ? last3.filter(x => x.fx.bizAt).length / last3.length : null;
      const qRate = last3.length ? last3.filter(x => x.fx.queries.length).length / last3.length : null;
      const tats = cur.bookedItems.map(x => x.fx.bizMs).filter(v => v != null);
      const lastLogin = items.reduce((a, x) => (!a || x.fx.loginAt > a ? x.fx.loginAt : a), null);
      const daysSince = lastLogin ? Math.floor((asOf - lastLogin) / DAY) : null;
      const potential = avg(trend.slice(2, 5).map(t => t.premium).filter(v => v > 0)) || 0;   // typical month before this one
      const everBefore = items.some(x => x.fx.loginAt < range(m)[0]);
      return {
        key: g.key, name, items, trend, cur, prev,
        premium: cur.premium, loan: cur.loan, logged: cur.logged, booked: cur.booked,
        avgTicket: cur.booked ? cur.premium / cur.booked : null,
        conv, qRate, avgTat: avg(tats), lastLogin, daysSince, potential, isNew: !everBefore && cur.logged > 0,
        open: items.filter(x => !x.fx.closed).length,
        openQ: items.reduce((a, x) => a + x.fx.openQ.length, 0)
      };
    });

    const total = sum(rows, r => r.premium);
    rows.forEach(r => { r.share = total ? r.premium / total : 0; });
    rows.forEach(r => { r.tags = tagsFor(r, s, rows); });   // after all shares are known
    rows.sort((a, b) => b.premium - a.premium || b.logged - a.logged || b.potential - a.potential);
    return { m, prevM, months, rows, total, active: rows.filter(r => r.logged > 0).length, s };
  }

  /* Labels with a reason and a suggested action. tone: good | warn | critical | info */
  function tagsFor(r, s, rows) {
    const t = [];
    const topShare = Math.max(...rows.map(x => x.share));
    if (r.premium > 0 && r.share === topShare && r.share >= 0.25)
      t.push({ label: 'Top partner', tone: 'good', icon: '★', why: `${Math.round(r.share * 100)}% of your business this month`, action: 'Keep them happy: fast TAT and quick updates on their customers' });
    if (r.isNew) t.push({ label: 'New', tone: 'info', icon: '✦', why: 'First files this month', action: 'Build the relationship: explain GCPP benefits for their customers' });
    if (r.prev.premium > 0 && r.premium >= r.prev.premium * 1.2)
      t.push({ label: 'Growing', tone: 'good', icon: '▲', why: `${inr(r.prev.premium, true)} → ${inr(r.premium, true)} vs last month`, action: 'Thank them, and ask for referrals from their other customers' });
    if (r.daysSince != null && r.daysSince > INACTIVE_DAYS && r.key !== '(not set)')
      t.push({ label: 'Inactive', tone: 'critical', icon: '●', why: `No new file for ${r.daysSince} days${r.potential ? ` (usually ${inr(r.potential, true)}/month)` : ''}`, action: 'Visit or call this week and ask about their upcoming home loan / LAP logins' });
    else if (r.prev.premium > 0 && r.premium <= r.prev.premium * 0.7)
      t.push({ label: 'Slowing down', tone: 'warn', icon: '▼', why: `${inr(r.prev.premium, true)} last month → ${inr(r.premium, true)} now`, action: 'Follow up on their pipeline, and remind them to offer insurance at login' });
    if (r.conv != null && r.items.length >= 2 && r.conv < 0.5)
      t.push({ label: 'Low conversion', tone: 'warn', icon: '◐', why: `Only ${Math.round(r.conv * 100)}% of their recent files reached ${s.businessStage}`, action: 'Check why files drop, and pre-qualify customers with them before login' });
    if (r.qRate != null && r.items.length >= 2 && r.qRate > 0.5)
      t.push({ label: 'Query-prone', tone: 'warn', icon: '!', why: `${Math.round(r.qRate * 100)}% of their recent files got queries`, action: 'Share the document checklist with them and check their files before submitting' });
    return t;
  }

  // Who to push first: lost/slowing business weighted by what they usually bring.
  function focusList(res) {
    const score = r => {
      const lost = Math.max(0, (r.potential || r.prev.premium) - r.premium);
      const inactive = r.tags.some(t => t.label === 'Inactive') ? 2 : 1;
      const warn = r.tags.filter(t => t.tone === 'warn' || t.tone === 'critical').length;
      return lost * inactive + warn * 10000;
    };
    return res.rows.filter(r => r.key !== '(not set)' && r.tags.some(t => t.tone === 'warn' || t.tone === 'critical'))
      .sort((a, b) => score(b) - score(a)).slice(0, 4);
  }

  const tagHtml = t => `<span class="tag ${t.tone}" title="${esc(t.why)}"><i>${t.icon}</i>${esc(t.label)}</span>`;
  const delta = (a, b) => {
    if (!b && !a) return '<span class="muted">–</span>';
    if (!b) return '<span class="delta up">new</span>';
    const d = (a - b) / b;
    return `<span class="delta ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(d * 100))}%</span>`;
  };
  const pct = v => v == null ? '–' : Math.round(v * 100) + '%';
  const ago = d => d == null ? '–' : d === 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago';

  /* ---------- screen: all sales managers ---------- */
  function render(m) {
    m = m || UI.month; UI.month = m;
    const res = compute(m);
    const focus = focusList(res);
    const top = res.rows[0];
    const inactive = res.rows.filter(r => r.tags.some(t => t.label === 'Inactive'));

    view().innerHTML = `
    <div class="page-head">
      <div><h1>Sales managers</h1><p class="sub">Insurance business from each Axis sales manager, and who to focus on.</p></div>
      <div class="head-actions"><div class="month-pick">
        <button class="icon-btn" id="m-prev" aria-label="Previous month">‹</button><select id="m-sel">${monthOptions(m)}</select><button class="icon-btn" id="m-next" aria-label="Next month">›</button>
      </div></div>
    </div>
    <div class="kpis">
      <div class="kpi"><span>Active this month</span><b>${res.active}</b><small>of ${res.rows.filter(r => r.key !== '(not set)').length} sales managers</small></div>
      <div class="kpi"><span>Top partner</span><b class="kpi-name">${top && top.premium ? esc(top.name) : '–'}</b><small>${top && top.premium ? inr(top.premium, true) + ' · ' + pct(top.share) + ' of business' : 'no business yet'}</small></div>
      <div class="kpi ${inactive.length ? 'alert' : ''}"><span>Inactive (${INACTIVE_DAYS}+ days)</span><b>${inactive.length}</b><small>${inactive.slice(0, 2).map(r => esc(r.name)).join(', ') || 'none'}</small></div>
      <div class="kpi"><span>Life premium · ${monthLabel(m).split(' ')[0]}</span><b>${inr(res.total, true)}</b><small>from ${res.rows.filter(r => r.premium > 0).length} sales managers</small></div>
    </div>

    ${focus.length ? `<section class="card"><div class="card-h"><div><h2>Focus this month</h2><p>Sales managers to push, ranked by how much business is at stake.</p></div></div>
      <div class="focus-list">${focus.map(r => `<a class="focus" href="#manager/${encodeURIComponent(r.key)}">
        <div class="focus-h"><b>${esc(r.name)}</b>${r.tags.filter(t => t.tone !== 'good').map(tagHtml).join('')}</div>
        ${r.tags.filter(t => t.tone === 'warn' || t.tone === 'critical').map(t => `<p><span class="muted">${esc(t.why)}.</span> → ${esc(t.action)}.</p>`).join('')}
      </a>`).join('')}</div></section>` : ''}

    <section class="card"><div class="card-h"><div><h2>Premium by sales manager · ${monthLabel(m)}</h2><p>Business that reached ${esc(res.s.businessStage)} this month. Hover a bar to compare with last month.</p></div></div>
      <div class="pad">${Charts.hbar(res.rows.filter(r => r.premium > 0 || r.prev.premium > 0).map(r => ({ label: r.name, value: r.premium,
        display: `${inr(r.premium, true)} · ${pct(r.share)}`, tip: `${r.name}: ${inr(r.premium)} this month (${r.booked} file${r.booked === 1 ? '' : 's'}) · last month ${inr(r.prev.premium)}` })),
        { W: chartW(), labelW: chartW() < 480 ? 120 : 170, valueW: 110, emptyText: 'No business booked this month yet' })}</div></section>

    ${res.rows.length ? `<div class="table-wrap"><table class="list sm-table">
      <thead><tr><th>Sales manager</th><th class="r">Files logged</th><th class="r">Reached ${esc(shortStage(res.s.businessStage))}</th><th class="r">Life premium</th><th class="r">Share</th><th class="r">vs last month</th>
        <th class="r">Conversion</th><th class="r">Avg TAT</th><th class="r">Query rate</th><th class="r">Last file</th><th>Status</th></tr></thead>
      <tbody>${res.rows.map(r => `<tr data-sm="${esc(r.key)}">
        <td><a class="name" href="#manager/${encodeURIComponent(r.key)}">${esc(r.name)}</a><div class="muted">${r.open} open file${r.open === 1 ? '' : 's'}${r.openQ ? ` · ${r.openQ} open quer${r.openQ === 1 ? 'y' : 'ies'}` : ''}</div></td>
        <td class="r num" data-label="Logged">${r.logged}</td>
        <td class="r num" data-label="Reached ${esc(shortStage(res.s.businessStage))}">${r.booked}</td>
        <td class="r num" data-label="Life premium"><b>${r.premium ? inr(r.premium) : '–'}</b><div class="muted">${r.loan ? inr(r.loan, true) + ' loan' : ''}</div></td>
        <td class="r num" data-label="Share">${r.premium ? pct(r.share) : '–'}</td>
        <td class="r num" data-label="vs last month">${delta(r.premium, r.prev.premium)}</td>
        <td class="r num" data-label="Conversion">${pct(r.conv)}</td>
        <td class="r num" data-label="Avg TAT">${r.avgTat != null ? dur(r.avgTat) : '–'}</td>
        <td class="r num" data-label="Query rate">${pct(r.qRate)}</td>
        <td class="r num" data-label="Last file">${ago(r.daysSince)}</td>
        <td data-label="Status">${r.tags.map(tagHtml).join(' ') || '<span class="muted">steady</span>'}</td>
      </tr>`).join('')}</tbody></table></div>`
      : `<div class="empty"><h3>No files yet</h3><p>Sales managers appear here as soon as files are added.</p></div>`}`;

    $('#m-sel').onchange = e => render(e.target.value);
    $('#m-prev').onclick = () => render(shiftMonth(m, -1));
    $('#m-next').onclick = () => render(shiftMonth(m, 1));
    $$('tr[data-sm]').forEach(tr => tr.onclick = e => { if (!e.target.closest('a')) location.hash = '#manager/' + encodeURIComponent(tr.dataset.sm); });
  }

  /* ---------- screen: one sales manager ---------- */
  function renderOne(key) {
    key = decodeURIComponent(key || '');
    const res = compute(UI.month);
    const r = res.rows.find(x => x.key === key);
    if (!r) { view().innerHTML = `<div class="empty"><h3>Sales manager not found</h3><p><a href="#managers">Back to sales managers</a></p></div>`; return; }
    const files = r.items.slice().sort((a, b) => (b.fx.loginAt || 0) - (a.fx.loginAt || 0));
    const allPremium = sum(r.items.filter(x => x.fx.bizAt), x => x.fx.premium);

    view().innerHTML = `
    <div class="page-head"><div><a href="#managers" class="back">‹ Sales managers</a>
      <h1>${esc(r.name)} ${r.tags.map(tagHtml).join('')}</h1>
      <p class="sub">${monthLabel(UI.month)} · last file ${ago(r.daysSince)} · ${r.items.length} file${r.items.length === 1 ? '' : 's'} in total, ${inr(allPremium, true)} premium overall</p></div></div>
    <div class="kpis">
      <div class="kpi"><span>Life premium</span><b>${inr(r.premium, true)}</b><small>${delta(r.premium, r.prev.premium)} vs last month</small></div>
      <div class="kpi"><span>Files logged</span><b>${r.logged}</b><small>${r.booked} reached ${esc(res.s.businessStage)}</small></div>
      <div class="kpi"><span>Share of your business</span><b>${pct(r.share)}</b><small>this month</small></div>
      <div class="kpi"><span>Conversion</span><b>${pct(r.conv)}</b><small>last 3 months</small></div>
      <div class="kpi"><span>Avg TAT</span><b>${r.avgTat != null ? dur(r.avgTat) : '–'}</b><small>this month</small></div>
      <div class="kpi ${r.openQ ? 'alert' : ''}"><span>Query rate</span><b>${pct(r.qRate)}</b><small>${r.openQ} open now</small></div>
    </div>
    ${r.tags.length ? `<section class="card"><div class="card-h"><div><h2>What to do</h2></div></div><ul class="todo">${r.tags.map(t => `<li>${tagHtml(t)} <span class="muted">${esc(t.why)}.</span> ${esc(t.action)}.</li>`).join('')}</ul></section>` : ''}
    <section class="card"><div class="card-h"><div><h2>Life premium, last 6 months</h2></div></div>
      <div class="pad">${Charts.columns(r.trend.map(t => ({ label: monthLabel(t.m).split(' ')[0].slice(0, 3), value: t.premium, display: t.premium ? inr(t.premium, true) : '0',
        tip: `${monthLabel(t.m)}: ${inr(t.premium)} from ${t.booked} file${t.booked === 1 ? '' : 's'} · ${t.logged} logged`, color: t.m === UI.month ? Charts.C.series : Charts.C.seriesSoft })), { W: chartW() })}</div></section>
    <section class="card"><div class="card-h"><div><h2>Files (${files.length})</h2></div></div>
      <div class="q-list flat pad">${files.map(({ f, fx }) => `<a class="q-item" href="#file/${f.id}">
        <div class="q-top">${stageBadge(fx)}<b>${esc(f.applicantName)}</b><span class="muted">${esc(f.appId || '')} · ${esc(f.mainLoanType || '')} · logged ${fmtDate(fx.loginAt)}</span></div>
        <p>${fx.premium ? inr(fx.premium) + ' premium' : ''}${fx.loan ? ' · ' + inr(fx.loan) + ' ins. loan' : ''} · TAT ${dur(fx.bizMs ?? fx.totalMs)}${fx.queries.length ? ` · ${fx.queries.length} quer${fx.queries.length === 1 ? 'y' : 'ies'}` : ''}</p></a>`).join('')}</div></section>`;
  }

  function chartW() { return Math.max(320, Math.min(1180, view().clientWidth - (innerWidth <= 700 ? 32 : 80))); }

  /* ---------- section for the monthly report ---------- */
  function reportSection(m) {
    const res = compute(m);
    const rows = res.rows.filter(r => r.logged || r.premium || r.prev.premium || r.open);
    if (!rows.length) return '';
    const focus = focusList(res);
    return `<section class="r-sec">
      <h2>Sales manager performance</h2>
      <div class="table-wrap"><table class="mini sm-report">
        <thead><tr><th>Sales manager</th><th class="r">Logged</th><th class="r">Reached ${esc(shortStage(res.s.businessStage))}</th><th class="r">Life premium</th><th class="r">Share</th><th class="r">vs last month</th><th class="r">Conversion</th><th class="r">Last file</th><th>Status</th></tr></thead>
        <tbody>${rows.map(r => `<tr><td><b>${esc(r.name)}</b></td><td class="r num">${r.logged}</td><td class="r num">${r.booked}</td><td class="r num">${r.premium ? inr(r.premium) : '–'}</td>
          <td class="r num">${r.premium ? pct(r.share) : '–'}</td><td class="r num">${delta(r.premium, r.prev.premium)}</td><td class="r num">${pct(r.conv)}</td><td class="r num">${ago(r.daysSince)}</td>
          <td>${r.tags.map(tagHtml).join(' ') || '<span class="muted">steady</span>'}</td></tr>`).join('')}</tbody></table></div>
      ${focus.length ? `<div class="ins plan"><h3><i>→</i> Sales managers to focus on</h3><ol>${focus.map(r => `<li><b>${esc(r.name)}</b>: ${r.tags.filter(t => t.tone === 'warn' || t.tone === 'critical').map(t => `${esc(t.why)}. ${esc(t.action)}.`).join(' ')}</li>`).join('')}</ol></div>` : ''}
    </section>`;
  }

  return { compute, render, renderOne, reportSection, focusList, keyOf };
})();
