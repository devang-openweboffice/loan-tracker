/* Tiny SVG chart kit — no external libraries, so charts also work inside the exported report file.
   Every mark carries data-tip; a single delegated tooltip (initTooltips) shows it on hover. */

const Charts = (() => {
  const C = {
    series: '#2a78d6', seriesSoft: '#86b6ef', good: '#0ca30c', warn: '#fab219', serious: '#ec835a', critical: '#d03b3b',
    grid: '#e1e0d9', axis: '#c3c2b7', ink: '#0b0b0b', ink2: '#52514e', muted: '#898781'
  };
  const ramp = ['#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'];

  /* Horizontal bars. rows: [{label, value, display, tip, color, sub}] */
  function hbar(rows, o = {}) {
    if (!rows.length) return empty(o.emptyText);
    const W = o.W || 480, rowH = o.rowH || 30, labelW = o.labelW || 150, valueW = o.valueW || 120, padT = o.benchmark != null ? 18 : 4;
    const plotW = W - labelW - valueW;
    const max = Math.max(o.max || 0, o.benchmark || 0, ...rows.map(r => r.value)) || 1;
    const H = padT + rows.length * rowH + 4;
    const x = v => labelW + (v / max) * plotW;
    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title || 'bar chart')}">`;
    s += `<line x1="${labelW}" x2="${labelW}" y1="${padT - 2}" y2="${H - 2}" stroke="${C.axis}" />`;
    rows.forEach((r, i) => {
      const y = padT + i * rowH, bh = Math.min(16, rowH - 10), by = y + (rowH - bh) / 2;
      const w = Math.max(r.value > 0 ? 3 : 0, x(r.value) - labelW);
      const tip = r.tip || `${r.label}: ${r.display ?? r.value}`;
      s += `<g class="mark" data-tip="${esc(tip)}">`;
      s += `<rect x="0" y="${y}" width="${W}" height="${rowH}" fill="transparent" />`;
      s += `<text x="${labelW - 8}" y="${y + rowH / 2}" dy="0.35em" text-anchor="end" class="lbl">${esc(trunc(r.label, Math.floor((labelW - 10) / 6.4)))}</text>`;
      if (w > 0) s += `<path d="${barPath(labelW, by, w, bh)}" fill="${r.color || C.series}" />`;
      s += `<text x="${labelW + w + 6}" y="${y + rowH / 2}" dy="0.35em" class="val">${esc(r.display ?? r.value)}</text>`;
      s += `</g>`;
    });
    if (o.benchmark != null) {
      const bx = x(o.benchmark);
      s += `<line x1="${bx}" x2="${bx}" y1="${padT - 4}" y2="${H - 2}" stroke="${C.ink2}" stroke-dasharray="3 3" />`;
      s += `<text x="${bx}" y="10" text-anchor="middle" class="bench">${esc(o.benchmarkLabel || 'Benchmark')}</text>`;
    }
    return s + '</svg>';
  }

  // Bar with 4px rounded data-end, square at the baseline.
  function barPath(x, y, w, h) {
    const r = Math.min(4, w, h / 2);
    return `M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x} Z`;
  }

  /* Target progress meter (HTML). */
  function meter(label, value, target, fmt, o = {}) {
    const pct = target ? value / target : 0;
    const pace = o.pace;   // expected fraction of target by today (current month only)
    let status, icon;
    if (pct >= 1) { status = 'good'; icon = '✓'; }
    else if (pace == null || pct >= pace) { status = 'good'; icon = '▲'; }
    else if (pct >= pace * 0.75) { status = 'warn'; icon = '●'; }
    else { status = 'critical'; icon = '▼'; }
    const statusText = pct >= 1 ? 'Target achieved' : pace == null ? (pct >= 0.9 ? 'Close to target' : 'Below target') : pct >= pace ? 'Ahead of pace' : pct >= pace * 0.75 ? 'Slightly behind pace' : 'Behind pace';
    return `<div class="meter">
      <div class="meter-top"><span class="meter-label">${esc(label)}</span><span class="status ${status}"><i>${icon}</i>${statusText}</span></div>
      <div class="meter-num"><b>${esc(fmt(value))}</b><span> of ${esc(fmt(target))}</span><em>${Math.round(pct * 100)}%</em></div>
      <div class="meter-track" data-tip="${esc(label)}: ${esc(fmt(value))} of ${esc(fmt(target))} (${Math.round(pct * 100)}%)">
        <div class="meter-fill" style="width:${Math.min(100, pct * 100)}%"></div>
        ${pace != null && pace < 1 ? `<div class="meter-pace" style="left:${pace * 100}%" title="Expected by today"></div>` : ''}
      </div>
      ${o.foot ? `<div class="meter-foot">${o.foot}</div>` : ''}
    </div>`;
  }

  /* Cumulative business line vs straight-line target pace. points: [{day, value}] */
  function cumulative(points, target, daysInMonth, fmt, o = {}) {
    const W = o.W || 960, H = o.H || 250, L = 64, R = 16, T = 14, B = 34;
    const pw = W - L - R, ph = H - T - B;
    const maxV = Math.max(target || 0, ...points.map(p => p.value)) * 1.05 || 1;
    const x = d => L + ((d - 1) / Math.max(1, daysInMonth - 1)) * pw;
    const y = v => T + ph - (v / maxV) * ph;
    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Cumulative business">`;
    for (let i = 0; i <= 4; i++) {
      const v = (maxV / 4) * i, yy = y(v);
      s += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="${i ? C.grid : C.axis}" />`;
      s += `<text x="${L - 8}" y="${yy}" dy="0.35em" text-anchor="end" class="tick">${esc(fmt(v))}</text>`;
    }
    [1, 8, 15, 22, daysInMonth].forEach(d => { s += `<text x="${x(d)}" y="${H - 18}" text-anchor="middle" class="tick">${d}</text>`; });
    if (target) {
      s += `<line x1="${x(1)}" y1="${y(0)}" x2="${x(daysInMonth)}" y2="${y(target)}" stroke="${C.muted}" stroke-dasharray="4 4" />`;
      s += `<text x="${x(daysInMonth) - 4}" y="${y(target) - 6}" text-anchor="end" class="bench">Target pace</text>`;
    }
    if (points.length) {
      const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.day)},${y(p.value)}`).join(' ');
      s += `<path d="${d}" fill="none" stroke="${C.series}" stroke-width="2" stroke-linejoin="round" />`;
      const lp = points[points.length - 1];
      s += `<circle cx="${x(lp.day)}" cy="${y(lp.value)}" r="4" fill="${C.series}" stroke="#fff" stroke-width="2" />`;
      s += `<text x="${Math.min(x(lp.day) + 8, W - 60)}" y="${y(lp.value) - 8}" class="val">${esc(fmt(lp.value))}</text>`;
      // hover columns
      points.forEach(p => {
        const pace = target ? target * (p.day - 1) / Math.max(1, daysInMonth - 1) : null;
        s += `<rect class="mark" x="${x(p.day) - pw / daysInMonth / 2}" y="${T}" width="${pw / daysInMonth}" height="${ph}" fill="transparent"
          data-tip="Day ${p.day}: ${esc(fmt(p.value))} achieved${pace != null ? ' · pace ' + esc(fmt(pace)) : ''}" />`;
      });
    }
    s += `<text x="${L + pw / 2}" y="${H - 1}" text-anchor="middle" class="tick">Day of month</text>`;
    return s + '</svg>';
  }

  /* Stage timeline strip for a single file (HTML flex). segments: [{stage, ms, open}] */
  function strip(segments) {
    const total = segments.reduce((a, s) => a + Math.max(s.ms, 0), 0);
    if (!segments.length) return '<div class="strip empty-strip">No stage history yet</div>';
    return `<div class="strip">${segments.map((s, i) => {
      const share = total ? Math.max(s.ms, 0) / total : 1 / segments.length;
      return `<div class="seg${s.open ? ' open' : ''}" style="flex:${Math.max(share, 0.04)};background:${ramp[Math.min(i, ramp.length - 1)]}"
        data-tip="${esc(s.stage)}: ${esc(dur(s.ms))}${s.open ? ' (still here)' : ''}"></div>`;
    }).join('')}</div>`;
  }

  /* Vertical columns — used for query counts by week etc. rows: [{label, value, display}] */
  function columns(rows, o = {}) {
    if (!rows.length) return empty(o.emptyText);
    const W = o.W || 480, H = 200, L = 36, B = 38, T = 18;
    const ph = H - T - B, pw = W - L - 8;
    const max = Math.max(...rows.map(r => r.value), 1);
    const slot = pw / rows.length, bw = Math.min(46, slot - 8);
    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title || 'column chart')}">`;
    s += `<line x1="${L}" x2="${W - 8}" y1="${T + ph}" y2="${T + ph}" stroke="${C.axis}" />`;
    rows.forEach((r, i) => {
      const h = (r.value / max) * ph, x = L + i * slot + (slot - bw) / 2, y = T + ph - h;
      s += `<g class="mark" data-tip="${esc(r.tip || r.label + ': ' + (r.display ?? r.value))}"><rect x="${L + i * slot}" y="${T}" width="${slot}" height="${ph + B}" fill="transparent" />`;
      if (h > 0) s += `<path d="M${x},${T + ph} V${y + Math.min(4, h)} Q${x},${y} ${x + Math.min(4, h)},${y} H${x + bw - Math.min(4, h)} Q${x + bw},${y} ${x + bw},${y + Math.min(4, h)} V${T + ph} Z" fill="${r.color || C.series}" />`;
      s += `<text x="${x + bw / 2}" y="${y - 5}" text-anchor="middle" class="val">${esc(r.display ?? r.value)}</text>`;
      s += `<text x="${x + bw / 2}" y="${T + ph + 16}" text-anchor="middle" class="tick">${esc(trunc(r.label, 14))}</text></g>`;
    });
    return s + '</svg>';
  }

  function empty(t) { return `<div class="chart-empty">${esc(t || 'No data for this period')}</div>`; }
  function trunc(t, n) { t = String(t); return t.length > n ? t.slice(0, n - 1) + '…' : t; }

  return { hbar, meter, cumulative, strip, columns, C, ramp };
})();

function initTooltips(root) {
  root = root || document;
  let tip = document.getElementById('viz-tip');
  if (!tip) { tip = document.createElement('div'); tip.id = 'viz-tip'; document.body.appendChild(tip); }
  root.addEventListener('mousemove', e => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (!el) { tip.style.opacity = 0; return; }
    tip.textContent = el.getAttribute('data-tip');
    tip.style.opacity = 1;
    const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = x + 'px'; tip.style.top = (e.clientY + 16) + 'px';
  });
  root.addEventListener('mouseleave', () => { tip.style.opacity = 0; });
}
