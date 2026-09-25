/* Monthly performance report: statistics, rule-based insights, charts, and sharing (print/PDF, HTML file, text summary). */

const Report = (() => {

  function stats(m) {
    const s = Store.settings();
    const target = Store.targetFor(m);
    const all = Store.files().map(f => ({ f, fx: fileFacts(f, s) }));
    const [Y, M] = m.split('-').map(Number);
    const monthStart = new Date(Y, M - 1, 1), monthEnd = new Date(Y, M, 1);
    const dim = new Date(Y, M, 0).getDate();
    const now = new Date();
    const isCurrent = m === thisMonth(), isFuture = monthStart > now;
    const inM = d => d && d >= monthStart && d < monthEnd;

    const logged = all.filter(x => inM(x.fx.loginAt));
    const booked = all.filter(x => inM(x.fx.bizAt));
    const worked = all.filter(x => x.fx.loginAt && x.fx.loginAt < monthEnd &&
      (inM(x.fx.loginAt) || x.fx.segments.some(sg => inM(sg.start)) || (!x.fx.closed)));

    const sum = (arr, fn) => arr.reduce((a, x) => a + fn(x), 0);
    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    const premium = sum(booked, x => x.fx.premium);
    const loan = sum(booked, x => x.fx.loan);

    // pace = share of the month elapsed (current month only)
    const dayNow = isCurrent ? now.getDate() : dim;
    const pace = isCurrent ? dayNow / dim : null;
    let workDaysLeft = 0;
    if (isCurrent) for (let d = now.getDate(); d <= dim; d++) if (new Date(Y, M - 1, d).getDay() !== 0) workDaysLeft++;

    // cumulative premium by day
    const byDay = new Array(dim + 1).fill(0);
    booked.forEach(x => { byDay[x.fx.bizAt.getDate()] += x.fx.premium; });
    const cum = []; let run = 0;
    for (let d = 1; d <= (isFuture ? 0 : dayNow); d++) { run += byDay[d]; cum.push({ day: d, value: run }); }

    // TAT
    const bizTats = booked.map(x => x.fx.bizMs).filter(v => v != null);
    const avgTat = avg(bizTats);
    const withinTat = bizTats.filter(v => days(v) <= s.tatBenchmarkDays).length;

    // stage durations (only finished segments, i.e. file has moved on)
    const stageTimes = {};
    worked.forEach(x => x.fx.segments.forEach((sg, i) => {
      if (sg.open || i === x.fx.segments.length - 1) return;
      if (!inM(sg.end) && !inM(sg.start)) return;
      (stageTimes[sg.stage] = stageTimes[sg.stage] || []).push(sg.ms);
    }));
    const stageAvg = s.stages.filter(st => stageTimes[st]).map(st => ({ stage: st, ms: avg(stageTimes[st]), n: stageTimes[st].length }));
    const bottleneck = stageAvg.slice().sort((a, b) => b.ms - a.ms)[0];

    // pipeline: where worked files are now
    const pipeline = s.stages.concat(OUTCOMES).map(st => ({ stage: st, n: worked.filter(x => x.fx.current === st).length })).filter(p => p.n);

    // queries raised this month
    const queries = [];
    all.forEach(x => x.fx.queries.forEach(q => { if (inM(new Date(q.raisedAt))) queries.push({ q, f: x.f }); }));
    const resolved = queries.filter(({ q }) => q.resolvedAt);
    const resMs = resolved.map(({ q }) => new Date(q.resolvedAt) - new Date(q.raisedAt));
    const avgRes = avg(resMs);
    const group = (arr, key) => {
      const g = {}; arr.forEach(it => { const k = key(it) || 'Other'; (g[k] = g[k] || []).push(it); });
      return Object.entries(g).map(([k, v]) => ({ k, v })).sort((a, b) => b.v.length - a.v.length);
    };
    const qByCat = group(queries, it => it.q.category);
    const qBy = group(queries, it => it.q.raisedBy);
    const qByStage = group(queries, it => it.q.stage);
    const loggedWithQ = logged.filter(x => x.fx.queries.length).length;
    const bookedClean = booked.filter(x => !x.fx.queries.length).length;

    // sources & mix (on files logged this month)
    const bySM = group(logged, x => x.f.salesManager).map(g => ({ k: g.k, n: g.v.length, premium: sum(g.v, x => x.fx.premium) }))
      .sort((a, b) => b.premium - a.premium);
    const byType = group(logged, x => x.f.mainLoanType).map(g => ({ k: g.k, n: g.v.length, premium: sum(g.v, x => x.fx.premium) }));

    const propAttach = logged.length ? logged.filter(x => num(x.f.propertyInsPremium) > 0).length / logged.length : null;
    const riderAttach = logged.length ? logged.filter(x => x.f.rider && x.f.rider !== 'None').length / logged.length : null;
    const avgTicket = booked.length ? premium / booked.length : null;
    const stuck = worked.filter(x => !x.fx.closed && days(x.fx.inStageMs) > s.stageBenchmarkDays)
      .sort((a, b) => b.fx.inStageMs - a.fx.inStageMs);
    const pipelinePremium = sum(worked.filter(x => !x.fx.bizAt && !x.fx.closed), x => x.fx.premium);
    const rejected = worked.filter(x => x.fx.outcome && x.fx.segments.length && inM(x.fx.segments[x.fx.segments.length - 1].start));

    return {
      m, s, target, all, logged, booked, worked, premium, loan, pace, isCurrent, isFuture, dim, dayNow, workDaysLeft, cum,
      avgTat, bizTats, withinTat, stageAvg, bottleneck, pipeline, queries, resolved, avgRes, qByCat, qBy, qByStage,
      loggedWithQ, bookedClean, bySM, byType, propAttach, riderAttach, avgTicket, stuck, pipelinePremium, rejected,
      openQ: queries.filter(({ q }) => !q.resolvedAt)
    };
  }

  /* ---------- insights ---------- */

  function insights(st, prev) {
    const { s, target } = st;
    const good = [], improve = [], actions = [];
    const pct = target.premium ? st.premium / target.premium : 0;
    const pctFiles = target.files ? st.logged.length / target.files : 0;
    const remaining = Math.max(0, target.premium - st.premium);

    // Target & pace
    if (pct >= 1) good.push(`<b>Premium target achieved:</b> ${inr(st.premium)} against ${inr(target.premium)} (${Math.round(pct * 100)}%).`);
    else if (st.pace != null && pct >= st.pace) good.push(`<b>Ahead of target pace:</b> ${Math.round(pct * 100)}% of the premium target is done with ${Math.round(st.pace * 100)}% of the month gone.`);
    else if (!st.isFuture) {
      improve.push(`<b>Premium is behind target:</b> ${inr(st.premium)} of ${inr(target.premium)} (${Math.round(pct * 100)}%)${st.pace != null ? `, while ${Math.round(st.pace * 100)}% of the month has gone` : ''}.`);
      if (st.isCurrent && st.workDaysLeft) {
        const perDay = remaining / st.workDaysLeft;
        const ticket = st.avgTicket || (target.files ? target.premium / target.files : 0);
        const filesNeeded = ticket ? Math.ceil(remaining / ticket) : null;
        actions.push(`Close <b>${inr(remaining)}</b> more premium in ${st.workDaysLeft} working days, about <b>${inr(perDay)}/day</b>${filesNeeded ? `, or roughly <b>${filesNeeded} more file${filesNeeded > 1 ? 's' : ''}</b> at the current average ticket of ${inr(ticket)}` : ''}.`);
      }
      if (st.pipelinePremium > 0) actions.push(`Push the files already in the pipeline: <b>${inr(st.pipelinePremium)}</b> of premium hasn't reached ${esc(s.businessStage)} yet.`);
    }
    if (pctFiles >= 1) good.push(`<b>File count target met:</b> ${st.logged.length} files logged (target ${target.files}).`);
    else if (!st.isFuture && target.files) improve.push(`<b>Fewer files than target:</b> ${st.logged.length} logged vs a target of ${target.files}. More logins from Axis sales managers are needed.`);

    // Month-on-month
    if (prev && prev.premium > 0) {
      const ch = (st.premium - prev.premium) / prev.premium;
      if (ch >= 0.1) good.push(`<b>Growth:</b> premium is up ${Math.round(ch * 100)}% on ${monthLabel(prev.m)} (${inr(prev.premium, true)} → ${inr(st.premium, true)}).`);
      else if (ch <= -0.1 && !st.isCurrent) improve.push(`<b>Premium fell ${Math.round(-ch * 100)}%</b> compared with ${monthLabel(prev.m)} (${inr(prev.premium, true)} → ${inr(st.premium, true)}).`);
    }

    // TAT
    if (st.avgTat != null) {
      const d = days(st.avgTat);
      if (d <= s.tatBenchmarkDays) good.push(`<b>Fast turnaround:</b> files take ${dur(st.avgTat)} on average from login to ${esc(s.businessStage)}, within the ${s.tatBenchmarkDays}-day target (${st.withinTat}/${st.bizTats.length} files on time).`);
      else improve.push(`<b>Turnaround is slow:</b> the average is ${dur(st.avgTat)} from login to ${esc(s.businessStage)}, against a target of ${s.tatBenchmarkDays} days. Only ${st.withinTat}/${st.bizTats.length} files were on time.`);
    }
    if (st.bottleneck && st.stageAvg.length > 1 && days(st.bottleneck.ms) >= 1) {
      improve.push(`<b>Bottleneck at "${esc(st.bottleneck.stage)}":</b> files sit here for ${dur(st.bottleneck.ms)} on average, longer than at any other stage (${st.bottleneck.n} file${st.bottleneck.n > 1 ? 's' : ''}).`);
      actions.push(`Follow up daily on files at <b>${esc(st.bottleneck.stage)}</b>, and ask the team handling it what they need from you in advance.`);
    }
    if (st.stuck.length) {
      improve.push(`<b>${st.stuck.length} file${st.stuck.length > 1 ? 's are' : ' is'} stuck</b> for more than ${s.stageBenchmarkDays} days in one stage: ${st.stuck.slice(0, 4).map(x => `${esc(x.f.applicantName)} (${esc(x.fx.current)}, ${dur(x.fx.inStageMs)})`).join('; ')}.`);
      actions.push(`Clear the stuck files first: ${st.stuck.slice(0, 3).map(x => esc(x.f.applicantName)).join(', ')}.`);
    }

    // Queries
    if (st.logged.length) {
      const qRate = st.loggedWithQ / st.logged.length;
      if (qRate === 0 && st.logged.length >= 2) good.push(`<b>Clean files:</b> none of the ${st.logged.length} files logged this month got a query.`);
      else if (qRate <= 0.2) good.push(`<b>Good file quality:</b> only ${Math.round(qRate * 100)}% of logged files got a query.`);
      else improve.push(`<b>Too many queries:</b> ${st.loggedWithQ} of ${st.logged.length} logged files (${Math.round(qRate * 100)}%) got at least one query.`);
    }
    if (st.qByCat.length) {
      const top = st.qByCat[0];
      improve.push(`<b>Most common query: "${esc(top.k)}"</b> (${top.v.length} of ${st.queries.length}). Example: “${esc(top.v[0].q.description)}”${top.v[0].q.reason ? `, raised because ${esc(top.v[0].q.reason)}` : ''}.`);
      actions.push(`<b>Prevent "${esc(top.k)}" queries:</b> ${esc(QUERY_CATEGORIES[top.k] || QUERY_CATEGORIES.Other)}`);
      if (st.qBy[0] && st.qBy[0].v.length >= 2) actions.push(`Most queries come from <b>${esc(st.qBy[0].k)}</b> (${st.qBy[0].v.length}). Ask them for their checklist and check files against it before submitting.`);
    }
    if (st.avgRes != null) {
      if (days(st.avgRes) <= s.queryBenchmarkDays) good.push(`<b>Queries closed quickly:</b> ${dur(st.avgRes)} on average (target ${s.queryBenchmarkDays} days).`);
      else improve.push(`<b>Queries take too long to close:</b> ${dur(st.avgRes)} on average, against a target of ${s.queryBenchmarkDays} days.`);
    }
    if (st.openQ.length) actions.push(`Close the <b>${st.openQ.length} open quer${st.openQ.length > 1 ? 'ies' : 'y'}</b>: ${st.openQ.slice(0, 3).map(({ q, f }) => `${esc(f.applicantName)} – ${esc(q.description)}`).join('; ')}.`);

    // Mix & sources
    if (st.bySM.length >= 3) good.push(`<b>Business from several sources:</b> ${st.bySM.length} Axis sales managers sent files. The biggest was ${esc(st.bySM[0].k)} (${inr(st.bySM[0].premium, true)}).`);
    if (st.bySM.length && st.logged.length >= 3) {
      const share = st.bySM[0].n / st.logged.length;
      if (share > 0.5) { improve.push(`<b>Relying on one source:</b> ${Math.round(share * 100)}% of files came from ${esc(st.bySM[0].k)}.`); actions.push(`Meet the other sales managers and DSAs at the branch to get more logins.`); }
    }
    if (st.bySM.length === 1 || st.bySM.length === 2) actions.push(`Build relationships with more sales managers. Only ${st.bySM.length} sent files this month.`);
    if (st.propAttach != null) {
      if (st.propAttach >= 0.8) good.push(`<b>High cross-sell:</b> ${Math.round(st.propAttach * 100)}% of files include property insurance.`);
      else if (st.logged.length) { improve.push(`<b>Property insurance is included in only ${Math.round(st.propAttach * 100)}% of files.</b>`); actions.push(`Offer property insurance with every home loan / LAP file.`); }
    }
    if (st.riderAttach != null && st.riderAttach >= 0.8 && st.logged.length) good.push(`<b>Riders:</b> ${Math.round(st.riderAttach * 100)}% of files include the ACI / APTD rider.`);
    if (st.rejected.length) improve.push(`<b>${st.rejected.length} file${st.rejected.length > 1 ? 's' : ''} rejected or cancelled:</b> ${st.rejected.map(x => `${esc(x.f.applicantName)} (${esc(x.fx.current)})`).join(', ')}.`);

    if (!good.length) good.push('Not enough data yet. Keep recording stages and queries and this section will fill in.');
    if (!improve.length) improve.push('Nothing to flag this month. Keep it up!');
    if (!actions.length) actions.push('Keep the current rhythm: log every file on the day it comes in and update stages as they change.');
    return { good, improve, actions: actions.slice(0, 6) };
  }

  /* ---------- render ---------- */

  // Charts are drawn at the width they will occupy (screen or A4 print) so text renders at its true size.
  function chartWidths(printing) {
    const narrow = printing || matchMedia("(max-width: 900px)").matches;
    const avail = printing ? 690 : Math.min(1040, view().clientWidth - (innerWidth <= 600 ? 32 : 40)) - (innerWidth <= 600 ? 32 : 64);
    const FW = Math.max(320, Math.min(976, avail));
    return { FW, HW: narrow ? FW : Math.floor((FW - 28) / 2) };
  }

  function render(m, printing) {
    const { FW, HW } = chartWidths(printing);
    const HB = (rows, o = {}) => Charts.hbar(rows, Object.assign({ W: HW, labelW: HW < 400 ? 120 : 150, valueW: HW < 400 ? 96 : 120 }, o));
    UI.month = m;
    const st = stats(m);
    const prev = stats(shiftMonth(m, -1));
    const ins = insights(st, prev);
    const { s, target } = st;
    const note = s.notes[m] || '';
    const compact = v => inr(v, true);
    const deltaTxt = (a, b, fmt) => {
      if (!b) return '';
      const d = a - b; const up = d >= 0;
      return `<span class="delta ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${fmt ? fmt(Math.abs(d)) : Math.abs(d)} vs ${monthLabel(prev.m).split(' ')[0]}</span>`;
    };

    const fileRows = st.worked.slice().sort((a, b) => (a.fx.loginAt || 0) - (b.fx.loginAt || 0));
    const tatRows = fileRows.filter(x => x.fx.totalMs != null).map(x => {
      const over = days(x.fx.bizMs ?? x.fx.totalMs) > s.tatBenchmarkDays;
      const running = !x.fx.bizAt && !x.fx.closed;
      return {
        label: x.f.applicantName, value: days(x.fx.bizMs ?? x.fx.totalMs),
        display: `${dur(x.fx.bizMs ?? x.fx.totalMs)}${running ? ' · running' : ''}${over ? ' · over' : ''}`,
        color: over ? Charts.C.serious : running ? Charts.C.seriesSoft : Charts.C.series,
        tip: `${x.f.applicantName} (${x.f.appId || '–'}): ${x.fx.bizAt ? 'reached ' + s.businessStage + ' in ' + dur(x.fx.bizMs) : 'running for ' + dur(x.fx.totalMs) + ', now at ' + x.fx.current}`
      };
    });

    view().innerHTML = `
    <div class="report-toolbar no-print">
      <a href="#files" class="back">‹ Files</a>
      <div class="month-pick">
        <button class="icon-btn" id="r-prev" aria-label="Previous month">‹</button>
        <select id="r-sel">${monthOptions(m)}</select>
        <button class="icon-btn" id="r-next" aria-label="Next month">›</button>
      </div>
      <span class="grow"></span>
      ${PWA.canShare() ? '<button class="btn primary" id="r-share">Share</button>' : ''}
      <button class="btn" id="r-copy">Copy summary (WhatsApp)</button>
      <button class="btn" id="r-mail">Email manager</button>
      <button class="btn" id="r-html">Download report</button>
      <button class="btn primary" id="r-print">Save as PDF / Print</button>
    </div>

    <article class="report" id="report-root">
      <header class="r-head">
        <div>
          <div class="r-eyebrow">Monthly performance report · ${esc(s.company)}</div>
          <h1>${monthLabel(m)}</h1>
          <p>${esc(s.rmName)} · ${esc(s.designation)} · Sub ID ${esc(s.subId)} · ${esc(s.branch)}</p>
        </div>
        <div class="r-meta">
          ${s.managerName ? `<div><span>Prepared for</span><b>${esc(s.managerName)}</b></div>` : ''}
          <div><span>Generated</span><b>${fmtDate(new Date(), true)}</b></div>
          <div><span>Status</span><b>${st.isCurrent ? `Month to date (day ${st.dayNow} of ${st.dim})` : st.isFuture ? 'Upcoming month' : 'Full month'}</b></div>
        </div>
      </header>

      <section class="r-sec">
        <div class="hero-row">
          <div class="hero">
            <span>Life premium booked</span>
            <b>${inr(st.premium)}</b>
            <small>${Math.round(target.premium ? st.premium / target.premium * 100 : 0)}% of ${inr(target.premium)} target ${deltaTxt(st.premium, prev.premium, compact)}</small>
          </div>
          <div class="stat"><span>Files logged</span><b>${st.logged.length}</b><small>${deltaTxt(st.logged.length, prev.logged.length)}</small></div>
          <div class="stat"><span>Reached ${esc(s.businessStage)}</span><b>${st.booked.length}</b><small>${inr(st.loan, true)} insurance loan</small></div>
          <div class="stat"><span>Avg TAT</span><b>${st.avgTat != null ? dur(st.avgTat) : '–'}</b><small>target ${s.tatBenchmarkDays}d</small></div>
          <div class="stat"><span>Queries</span><b>${st.queries.length}</b><small>${st.openQ.length} open · avg ${st.avgRes != null ? dur(st.avgRes) : '–'} to close</small></div>
        </div>
      </section>

      <section class="r-sec">
        <h2>Target achievement</h2>
        <div class="meters">
          ${Charts.meter('Life premium', st.premium, target.premium, compact, { pace: st.pace, foot: st.isCurrent && target.premium > st.premium ? `Need ${inr(target.premium - st.premium, true)} more · ${st.workDaysLeft} working days left` : '' })}
          ${Charts.meter('Insurance loan amount', st.loan, target.loan, compact, { pace: st.pace })}
          ${Charts.meter('Files logged', st.logged.length, target.files, v => String(Math.round(v)), { pace: st.pace })}
        </div>
        <div class="fig">
          <h3>Premium booked through the month vs target pace</h3>
          ${st.isFuture ? Charts.cumulative([], target.premium, st.dim, compact, { W: FW }) : Charts.cumulative(st.cum, target.premium, st.dim, compact, { W: FW })}
        </div>
      </section>

      <section class="r-sec two">
        <div class="fig">
          <h3>Where the files are now</h3>
          <p class="cap">Current stage of every file worked on this month (${st.worked.length})</p>
          ${HB(st.pipeline.map(p => ({ label: p.stage, value: p.n, display: p.n + (p.n > 1 ? ' files' : ' file'), color: OUTCOMES.includes(p.stage) ? Charts.C.critical : p.stage === s.stages[s.stages.length - 1] ? Charts.C.good : Charts.C.series })), { title: 'Files by stage' })}
        </div>
        <div class="fig">
          <h3>Average time spent in each stage</h3>
          <p class="cap">Only stages the file has moved on from${st.bottleneck ? ` · slowest: <b>${esc(st.bottleneck.stage)}</b>` : ''}</p>
          ${HB(st.stageAvg.map(a => ({ label: a.stage, value: days(a.ms), display: dur(a.ms), color: st.bottleneck && a.stage === st.bottleneck.stage && st.stageAvg.length > 1 ? Charts.C.serious : Charts.C.series, tip: `${a.stage}: ${dur(a.ms)} avg across ${a.n} file(s)` })),
            { benchmark: s.stageBenchmarkDays, benchmarkLabel: `${s.stageBenchmarkDays}d limit`, emptyText: 'Stage times appear once files move between stages' })}
        </div>
      </section>

      <section class="r-sec">
        <div class="fig">
          <h3>Turnaround time per file</h3>
          <p class="cap">Login → ${esc(s.businessStage)} (days). Dashed line = ${s.tatBenchmarkDays}-day target. <span class="key"><i style="background:${Charts.C.series}"></i>on time</span><span class="key"><i style="background:${Charts.C.seriesSoft}"></i>still running</span><span class="key"><i style="background:${Charts.C.serious}"></i>over target</span></p>
          ${HB(tatRows, { benchmark: s.tatBenchmarkDays, benchmarkLabel: `${s.tatBenchmarkDays}-day target`, labelW: FW < 500 ? 130 : 200, W: FW, valueW: FW < 500 ? 120 : 170 })}
        </div>
      </section>

      <section class="r-sec">
        <h2>Queries</h2>
        <div class="two">
          <div class="fig"><h3>By type</h3>${HB(st.qByCat.map(g => ({ label: g.k, value: g.v.length, display: String(g.v.length) })), { emptyText: 'No queries this month 🎉' })}</div>
          <div class="fig"><h3>By who raised them</h3>${HB(st.qBy.map(g => ({ label: g.k, value: g.v.length, display: String(g.v.length) })), { emptyText: 'No queries this month' })}</div>
        </div>
        ${st.queries.length ? `<div class="table-wrap"><table class="mini q-table">
          <thead><tr><th>File</th><th>Query</th><th>Why it came</th><th>Stage / by</th><th>Raised</th><th class="r">Time to resolve</th></tr></thead>
          <tbody>${st.queries.sort((a, b) => new Date(a.q.raisedAt) - new Date(b.q.raisedAt)).map(({ q, f }) => {
            const ms = (q.resolvedAt ? new Date(q.resolvedAt) : new Date()) - new Date(q.raisedAt);
            return `<tr><td><b>${esc(f.applicantName)}</b><div class="muted">${esc(f.appId || '')}</div></td>
              <td>${esc(q.description)}<div class="muted">${esc(q.category)}</div>${q.resolution ? `<div class="muted">✓ ${esc(q.resolution)}</div>` : ''}</td>
              <td>${esc(q.reason || '–')}</td><td>${esc(q.stage)}<div class="muted">${esc(q.raisedBy)}</div></td>
              <td>${fmtDate(q.raisedAt)}</td>
              <td class="r num">${q.resolvedAt ? dur(ms) : `<span class="status ${days(ms) > s.queryBenchmarkDays ? 'critical' : 'warn'}"><i>●</i>open ${dur(ms)}</span>`}</td></tr>`;
          }).join('')}</tbody></table></div>` : ''}
      </section>

      <section class="r-sec two">
        <div class="fig">
          <h3>Premium by Axis sales manager</h3>
          <p class="cap">Files logged this month</p>
          ${HB(st.bySM.map(g => ({ label: g.k, value: g.premium, display: `${compact(g.premium)} · ${g.n} file${g.n > 1 ? 's' : ''}` })), {})}
        </div>
        <div class="fig">
          <h3>Premium by loan type</h3>
          <p class="cap">Files logged this month</p>
          ${HB(st.byType.map(g => ({ label: g.k, value: g.premium, display: `${compact(g.premium)} · ${g.n} file${g.n > 1 ? 's' : ''}` })), {})}
        </div>
      </section>

      ${Managers.reportSection(m)}

      <section class="r-sec insights">
        <h2>Performance review</h2>
        <div class="ins-grid">
          <div class="ins good"><h3><i>✓</i> What's going well</h3><ul>${ins.good.map(x => `<li>${x}</li>`).join('')}</ul></div>
          <div class="ins improve"><h3><i>!</i> What needs improvement</h3><ul>${ins.improve.map(x => `<li>${x}</li>`).join('')}</ul></div>
        </div>
        <div class="ins plan"><h3><i>→</i> Action plan</h3><ol>${ins.actions.map(x => `<li>${x}</li>`).join('')}</ol></div>
        <div class="ins note">
          <h3>Note from ${esc(s.rmName.split(' ')[0])}</h3>
          <textarea id="r-note" class="no-print-border" rows="3" placeholder="Add your own comments for your manager: market situation, support you need, plans for next month…">${esc(note)}</textarea>
        </div>
      </section>

      <section class="r-sec">
        <h2>File-wise detail <span class="muted">(${fileRows.length})</span></h2>
        ${fileRows.length ? `<div class="file-cards">${fileRows.map(({ f, fx }) => `
          <div class="fcard">
            <div class="fcard-h"><div><b>${esc(f.applicantName)}</b><div class="muted">${esc(f.appId || '–')} · ${esc(f.mainLoanType || '')} · SM ${esc(f.salesManager || '–')}</div></div>${stageBadge(fx)}</div>
            <div class="fcard-n">
              <div><span>Life premium</span><b>${inr(fx.premium)}</b></div>
              <div><span>Ins. loan</span><b>${inr(fx.loan)}</b></div>
              <div><span>Logged</span><b>${fmtDate(fx.loginAt)}</b></div>
              <div><span>${fx.bizAt ? 'TAT to ' + esc(shortStage(s.businessStage)) : 'Running'}</span><b class="${days(fx.bizMs ?? fx.totalMs) > s.tatBenchmarkDays ? 'late' : ''}">${dur(fx.bizMs ?? fx.totalMs)}</b></div>
            </div>
            ${Charts.strip(fx.segments)}
            <div class="strip-legend">${fx.segments.map(sg => `<span>${esc(sg.stage)} <b>${sg.open ? dur(sg.ms) + '…' : (sg === fx.segments[fx.segments.length - 1] ? '✓' : dur(sg.ms))}</b></span>`).join('')}</div>
            ${fx.queries.length ? `<ul class="fq">${fx.queries.map(q => `<li class="${q.resolvedAt ? '' : 'open'}"><b>${esc(q.category)}</b>: ${esc(q.description)}${q.reason ? ` <span class="muted">(${esc(q.reason)})</span>` : ''} · ${q.resolvedAt ? 'resolved in ' + dur(new Date(q.resolvedAt) - new Date(q.raisedAt)) : 'open ' + dur(new Date() - new Date(q.raisedAt))}</li>`).join('')}</ul>` : '<div class="muted fq-none">No queries</div>'}
          </div>`).join('')}</div>` : '<div class="chart-empty">No files for this month</div>'}
      </section>

      <footer class="r-foot">Prepared by ${esc(s.rmName)} (${esc(s.subId)}) · ${esc(s.company)} · ${fmtDate(new Date(), true)}</footer>
    </article>`;

    $('#r-sel').onchange = e => { location.hash = '#report/' + e.target.value; };
    $('#r-prev').onclick = () => { location.hash = '#report/' + shiftMonth(m, -1); };
    $('#r-next').onclick = () => { location.hash = '#report/' + shiftMonth(m, 1); };
    const noteEl = $('#r-note');
    const autosize = () => { noteEl.style.height = 'auto'; noteEl.style.height = noteEl.scrollHeight + 2 + 'px'; };
    autosize();
    noteEl.oninput = () => { autosize(); const ss = Store.settings(); ss.notes[m] = noteEl.value; Store.saveSettings(ss); };
    $('#r-print').onclick = () => { document.title = fileName(st, ''); window.print(); document.title = 'Avani · Loan Insurance Tracker'; };
    $('#r-html').onclick = () => download(fileName(st, '.html'), exportHtml(st), 'text/html');
    const sb = $('#r-share');
    if (sb) sb.onclick = async () => {
      const ok = await PWA.share({ title: `Monthly report – ${monthLabel(m)}`, text: summaryText(st, ins), fileName: fileName(st, '.html'), content: exportHtml(st), type: 'text/html' });
      if (!ok) toast('Sharing did not work. Use "Download report" instead.');
    };
    $('#r-copy').onclick = () => {
      const t = summaryText(st, ins);
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Summary copied. Paste it into WhatsApp or email.'))
        .catch(() => { prompt('Copy this summary:', t); });
    };
    $('#r-mail').onclick = () => {
      const subj = `Monthly report – ${monthLabel(m)} – ${s.rmName}`;
      const body = summaryText(st, ins) + '\n\n(Full report with charts attached as PDF.)';
      location.href = `mailto:${encodeURIComponent(s.managerEmail || '')}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
      toast('Tip: use "Save as PDF" and attach the PDF to the email');
    };
  }

  function fileName(st, ext) {
    return `${st.s.rmName.replace(/\s+/g, '-')}-Report-${monthLabel(st.m).replace(' ', '-')}${ext}`;
  }

  function summaryText(st, ins) {
    const { s, target } = st;
    const strip = h => h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const lines = [
      `*${s.rmName} – ${monthLabel(st.m)} report*`,
      `${s.company} · ${s.branch}`,
      '',
      `Premium booked: ${inr(st.premium)} / ${inr(target.premium)} (${Math.round(target.premium ? st.premium / target.premium * 100 : 0)}%)`,
      `Insurance loan: ${inr(st.loan)} / ${inr(target.loan)}`,
      `Files logged: ${st.logged.length} / ${target.files} · reached ${s.businessStage}: ${st.booked.length}`,
      `Avg TAT: ${st.avgTat != null ? dur(st.avgTat) : '–'} (target ${s.tatBenchmarkDays}d)`,
      `Queries: ${st.queries.length} raised, ${st.openQ.length} open, avg ${st.avgRes != null ? dur(st.avgRes) : '–'} to close`,
      '',
      '*Going well*', ...ins.good.map(x => '✅ ' + strip(x)),
      '', '*To improve*', ...ins.improve.map(x => '⚠️ ' + strip(x)),
      '', '*Action plan*', ...ins.actions.map((x, i) => `${i + 1}. ${strip(x)}`)
    ];
    const note = s.notes[st.m];
    if (note) lines.push('', '*Note*', note);
    return lines.join('\n');
  }

  function exportHtml(st) {
    const clone = $('#report-root').cloneNode(true);
    const ta = clone.querySelector('#r-note');
    const d = document.createElement('div'); d.className = 'note-text';
    d.textContent = $('#r-note').value || '—'; ta.replaceWith(d);
    const css = $('#app-css').textContent;
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(fileName(st, '').replace(/-/g, ' '))}</title><style>${css}</style></head>
<body class="exported"><main id="view">${clone.outerHTML}</main>
<script>function esc(s){return s}${initTooltips.toString()};initTooltips(document);<\/script></body></html>`;
  }

  return { render, stats };
})();

// Redraw the report charts when the window is resized or printed, so they always match the available width.
(() => {
  const onReport = () => Lock.isUnlocked() && /^#\/?report/.test(location.hash);
  const month = () => location.hash.split('/')[1] || UI.month;
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if (onReport()) { const y = scrollY; Report.render(month()); scrollTo(0, y); } }, 150); });
  window.addEventListener('beforeprint', () => { if (onReport()) Report.render(month(), true); });
  window.addEventListener('afterprint', () => { if (onReport()) Report.render(month()); });
})();
