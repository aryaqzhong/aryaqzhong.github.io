(() => {
  const X = window.Explainer, { el, scale } = X;
  const pct = v => Math.round(v * 100) + '%';
  const num = v => (Math.abs(v) < .005 ? '0.00' : (v < 0 ? '−' : '') + Math.abs(v).toFixed(2));
  const clear = svg => { while (svg.firstChild) svg.removeChild(svg.firstChild); };
  const size = svg => { const b = svg.parentNode.getBoundingClientRect(); return [Math.max(280, Math.round(b.width)), Math.max(220, Math.round(b.height))]; };
  const onResize = fn => { let t = 0; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(fn, 150); }); };
  const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const txt = (parent, attrs, s) => { const n = el('text', attrs, parent); n.textContent = s; return n; };
  const segButtons = (holder, items, onPick) => items.map(([v, label]) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.dataset.v = v;
    b.addEventListener('click', () => onPick(v)); holder.appendChild(b); return b;
  });

  function citations() {
    const pop = document.createElement('div'); pop.className = 'bcite-pop'; pop.setAttribute('role', 'tooltip'); document.body.appendChild(pop);
    const show = a => {
      const li = document.querySelector(a.getAttribute('href')); if (!li) return;
      pop.textContent = '';
      const b = document.createElement('b'); b.textContent = `Reference ${a.getAttribute('href').replace('#ref-', '')}`;
      const s = document.createElement('span'); s.textContent = li.textContent.trim().split(' Data under')[0];
      pop.append(b, s);
      const r = a.getBoundingClientRect(), w = Math.min(340, innerWidth - 32);
      pop.style.left = `${Math.max(16, Math.min(scrollX + r.left - 20, scrollX + innerWidth - w - 16))}px`;
      pop.style.top = `${scrollY + r.bottom + 8}px`;
      pop.classList.add('on');
    };
    const hide = () => pop.classList.remove('on');
    document.querySelectorAll('a.bcite').forEach(a => {
      a.addEventListener('mouseenter', () => show(a)); a.addEventListener('mouseleave', hide);
      a.addEventListener('focus', () => show(a)); a.addEventListener('blur', hide);
    });
  }

  function ratersLab(data) {
    const fig = document.getElementById('lab-raters'); if (!fig) return;
    const svg = fig.querySelector('svg'), range = fig.querySelector('[data-role=k]'), out = fig.querySelector('[data-out=k]');
    const read = fig.querySelector('[data-role=read]'), hover = fig.querySelector('[data-role=hover]');
    const D = [...data.descriptors].sort((a, b) => a.se_ratio - b.se_ratio);
    const SHORT = { 'Dynamic sophistication': 'Sophistication', 'Articulation length': 'Articulation', 'Dynamic range': 'Dyn. range', 'Timbre variety': 'Timbre variety' };
    const ratio = (d, k) => d.se_ratio * Math.sqrt(d.k / k), ci = (d, k) => d.ci * Math.sqrt(d.k / k), need = d => Math.ceil(d.k * d.se_ratio * d.se_ratio);
    let k = 10, focus = null;
    const btns = segButtons(fig.querySelector('[data-role=preset]'), [[10, 'PercePiano: 10'], [63, 'implied by the paper: 63']], v => { k = +v; range.value = k; draw(); });
    const describe = d => {
      const r = ratio(d, k);
      return `${d.short}: with ${k} raters, a performance’s mean is uncertain by ±${ci(d, k).toFixed(2)} points, ${r.toFixed(1)}× the typical difference between two pianists. ` +
        (r > 1 ? `Single performances need about ${need(d)} raters to be compared.` : 'Single performances can be compared.');
    };
    function draw() {
      out.textContent = k;
      btns.forEach(b => b.setAttribute('aria-pressed', +b.dataset.v === k));
      const over = D.filter(d => ratio(d, k) > 1).length;
      read.innerHTML = `<span><b>${over} of 19</b>scales noisier than the typical difference between two pianists</span><span><b>±${median(D.map(d => ci(d, k))).toFixed(2)}</b>median 95% interval of one performance’s mean, 1–7 scale</span>`;
      clear(svg);
      const [W, H] = size(svg), narrow = W < 560;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const lw = narrow ? 104 : 168, top = 30, bot = H - 26, rh = (bot - top) / D.length;
      const x = scale(0, 3, lw + 10, W - (narrow ? 40 : 56));
      el('rect', { x: x(1), y: top - 6, width: x(3) - x(1), height: bot - top + 6, fill: 'rgba(255,255,255,.035)' }, svg);
      const ax = el('g', { class: 'ax' }, svg);
      [0, 1, 2, 3].forEach(v => { el('line', { x1: x(v), x2: x(v), y1: top - 6, y2: bot, stroke: v === 1 ? '#9a9a9a' : '#1f1f1f', 'stroke-dasharray': v === 1 ? '4 4' : '' }, ax); txt(ax, { x: x(v), y: H - 8, 'text-anchor': 'middle' }, v ? `${v}×` : '0'); });
      txt(svg, { x: x(1) + 6, y: 14, class: 't-soft' }, narrow ? 'noise > difference →' : 'noise larger than the difference between pianists →');
      D.forEach((d, n) => {
        const r = ratio(d, k), cy = top + (n + .5) * rh, bad = r > 1, hi = focus === d.id;
        const g = el('g', { opacity: focus && !hi ? .45 : 1 }, svg);
        txt(g, { x: lw, y: cy, dy: '.35em', 'text-anchor': 'end', class: hi ? 't-hi' : bad ? 't-muted' : 't-soft' }, narrow ? (SHORT[d.short] || d.short) : d.short);
        const bh = Math.min(10, rh * .52);
        el('rect', { x: x(0), y: cy - bh / 2, width: Math.max(1, x(Math.min(r, 3)) - x(0)), height: bh, fill: bad ? '#575757' : '#fff' }, g);
        txt(g, { x: x(Math.min(r, 3)) + 6, y: cy, dy: '.35em', class: 't-muted t-num' }, (r > 3 ? '› ' : '') + r.toFixed(2) + '×');
        const hit = el('rect', { x: 0, y: cy - rh / 2, width: W, height: rh, fill: 'transparent' }, svg);
        hit.addEventListener('pointerenter', () => { if (focus === d.id) return; focus = d.id; hover.textContent = describe(d); draw(); });
        hit.addEventListener('pointerleave', () => { focus = null; hover.textContent = ''; draw(); });
      });
    }
    range.addEventListener('input', () => { k = +range.value; draw(); });
    draw(); onResize(draw);
  }

  function screenLab(data) {
    const fig = document.getElementById('lab-screen'); if (!fig) return;
    const F = data.features, svg = fig.querySelector('svg'), read = fig.querySelector('[data-role=read]'), hover = fig.querySelector('[data-role=hover]');
    const rI = fig.querySelector('[data-role=icc]'), rR = fig.querySelector('[data-role=r2]'), cb = fig.querySelector('[data-role=ci]'), reset = fig.querySelector('[data-role=reset]');
    const oI = fig.querySelector('[data-out=icc]'), oR = fig.querySelector('[data-out=r2]');
    let ti = .30, tr = .10, useCI = true, focus = null;
    const isCand = f => f.icc >= ti - 1e-9 && f.r2 <= tr + 1e-9 && (!useCI || (f.icc_lo >= ti - .1 - 1e-9 && f.r2_hi <= tr + .1 + 1e-9));
    const describe = f => `${f.label}: performer ICC ${num(f.icc)} [${num(f.icc_lo)}, ${num(f.icc_hi)}] · R² from the 19 ratings ${num(f.r2)} [${num(f.r2_lo)}, ${num(f.r2_hi)}]`;
    function draw() {
      oI.textContent = ti.toFixed(2); oR.textContent = tr.toFixed(2);
      const pre = Math.abs(ti - .3) < 1e-6 && Math.abs(tr - .1) < 1e-6 && useCI;
      reset.setAttribute('aria-pressed', pre);
      const C = F.filter(isCand).sort((a, b) => a.r2 - b.r2);
      read.innerHTML = `<span><b>${C.length}</b>${C.length === 1 ? 'blind spot' : 'blind spots'}${C.length ? ': ' + C.map(f => f.label).join(', ') : ''}</span><span>${pre ? 'the rule fixed before the results' : 'not the rule fixed in advance'}</span>`;
      clear(svg);
      const [W, H] = size(svg), narrow = W < 560;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const l = 40, r = narrow ? 12 : 190, t = 22, b = 36;
      const x = scale(0, .5, l, W - r), y = scale(-.05, .55, H - b, t);
      const ax = el('g', { class: 'ax' }, svg);
      [0, .1, .2, .3, .4, .5].forEach(v => {
        el('line', { x1: x(v), x2: x(v), y1: t, y2: H - b, stroke: '#1c1c1c' }, ax); txt(ax, { x: x(v), y: H - b + 16, 'text-anchor': 'middle' }, v.toFixed(1));
        el('line', { x1: l, x2: W - r, y1: y(v), y2: y(v), stroke: v ? '#1c1c1c' : '#333' }, ax); txt(ax, { x: l - 6, y: y(v), dy: '.35em', 'text-anchor': 'end' }, v.toFixed(1));
      });
      txt(svg, { x: W - r, y: H - 4, 'text-anchor': 'end', class: 't-muted' }, narrow ? 'consistent (ICC) →' : 'consistent for a pianist (performer ICC) →');
      txt(svg, { x: l, y: 10, class: 't-muted' }, narrow ? '↑ predicted (R²)' : '↑ predicted by the 19 ratings (R²)');
      el('rect', { x: x(ti), y: y(tr), width: x(.5) - x(ti), height: y(-.05) - y(tr), fill: 'rgba(255,255,255,.06)', stroke: '#777', 'stroke-dasharray': '4 4' }, svg);
      txt(svg, { x: x(ti) + 6, y: y(tr) + 15, class: 't-soft' }, 'blind-spot region');
      F.forEach(f => {
        const c = isCand(f), hi = focus === f.id;
        if (hi) {
          el('line', { x1: x(f.icc_lo), x2: x(f.icc_hi), y1: y(f.r2), y2: y(f.r2), stroke: '#bbb' }, svg);
          el('line', { x1: x(f.icc), x2: x(f.icc), y1: y(f.r2_lo), y2: y(f.r2_hi), stroke: '#bbb' }, svg);
        }
        el('circle', { cx: x(f.icc), cy: y(f.r2), r: c ? 6 : hi ? 5 : 4, fill: c ? '#fff' : hi ? '#cfcfcf' : '#6f6f6f', stroke: c ? 'var(--sheet)' : 'none', 'stroke-width': 2 }, svg);
      });
      if (!narrow) {
        const lx = W - r + 18;
        C.forEach((f, n) => {
          const ly = y(0) - n * 20;
          el('line', { x1: x(f.icc) + 7, y1: y(f.r2), x2: lx - 5, y2: ly, stroke: '#555' }, svg);
          txt(svg, { x: lx, y: ly, dy: '.35em', class: 't-hi' }, f.label);
        });
        if (focus && !C.some(f => f.id === focus)) {
          const f = F.find(q => q.id === focus);
          txt(svg, { x: x(f.icc) + 9, y: y(f.r2) - 9, class: 't-soft halo' }, f.label);
        }
      }
      F.forEach(f => {
        const hit = el('circle', { cx: x(f.icc), cy: y(f.r2), r: 11, fill: 'transparent' }, svg);
        hit.addEventListener('pointerenter', () => { if (focus === f.id) return; focus = f.id; hover.textContent = describe(f); draw(); });
        hit.addEventListener('pointerleave', () => { focus = null; hover.textContent = ''; draw(); });
      });
    }
    rI.addEventListener('input', () => { ti = +rI.value; draw(); });
    rR.addEventListener('input', () => { tr = +rR.value; draw(); });
    cb.addEventListener('change', () => { useCI = cb.checked; draw(); });
    reset.addEventListener('click', () => { ti = .3; tr = .1; useCI = true; rI.value = .3; rR.value = .1; cb.checked = true; draw(); });
    draw(); onResize(draw);
  }

  function shortLab(data) {
    const fig = document.getElementById('lab-short'); if (!fig) return;
    const S = data.short_form, svg = fig.querySelector('svg'), range = fig.querySelector('[data-role=k]'), out = fig.querySelector('[data-out=k]');
    const read = fig.querySelector('[data-role=read]'), picks = fig.querySelector('[data-role=picks]');
    const items = S.map(s => { const li = document.createElement('li'); li.textContent = s.short; picks.appendChild(li); return li; });
    let k = 4;
    function draw() {
      out.textContent = k;
      items.forEach((li, n) => li.classList.toggle('on', n < k));
      const cur = S[k - 1];
      read.innerHTML = `<span><b>${pct(cur.rel)}</b>of what all 19 scales measure, from ${k} ${k === 1 ? 'scale' : 'scales'}</span>` + (k === 4 ? '<span><b>25 of 25</b>held-out folds choose these four</span>' : '');
      clear(svg);
      const [W, H] = size(svg), narrow = W < 560;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const l = 46, r = 18, t = 26, b = 34;
      const x = scale(1, 10, l + 10, W - r - 10), y = scale(.5, 1, H - b, t);
      const ax = el('g', { class: 'ax' }, svg);
      [.5, .6, .7, .8, .9, 1].forEach(v => { el('line', { x1: l, x2: W - r, y1: y(v), y2: y(v), stroke: v === 1 ? '#444' : '#1c1c1c', 'stroke-dasharray': v === 1 ? '4 4' : '' }, ax); txt(ax, { x: l - 6, y: y(v), dy: '.35em', 'text-anchor': 'end' }, pct(v)); });
      [...S.map(s => [s.k, String(s.k)]), [9, '…'], [10, '19']].forEach(([v, s]) => txt(ax, { x: x(v), y: H - b + 18, 'text-anchor': 'middle' }, s));
      txt(svg, { x: l, y: 12, class: 't-muted' }, narrow ? '↑ share of the 19-scale consensus' : '↑ share of what all 19 scales measure about the consensus');
      txt(svg, { x: W - r, y: H - 2, 'text-anchor': 'end', class: 't-muted' }, 'scales kept →');
      el('line', { x1: x(k), x2: x(k), y1: y(cur.rel), y2: H - b, stroke: '#555', 'stroke-dasharray': '3 3' }, svg);
      el('path', { d: S.map((s, n) => `${n ? 'L' : 'M'}${x(s.k).toFixed(1)},${y(s.rel).toFixed(1)}`).join(' '), fill: 'none', stroke: '#8a8a8a', 'stroke-width': 1.5 }, svg);
      el('line', { x1: x(8), y1: y(S[7].rel), x2: x(10), y2: y(1), stroke: '#555', 'stroke-dasharray': '3 4' }, svg);
      S.forEach(s => el('circle', { cx: x(s.k), cy: y(s.rel), r: s.k === k ? 6.5 : 4, fill: s.k <= k ? '#fff' : '#555', stroke: 'var(--sheet)', 'stroke-width': 2 }, svg));
      el('circle', { cx: x(10), cy: y(1), r: 4, fill: '#8a8a8a' }, svg);
      txt(svg, { x: x(10), y: y(1) - 10, 'text-anchor': 'end', class: 't-muted' }, 'all 19');
      txt(svg, { x: x(k), y: y(cur.rel) - 13, 'text-anchor': 'middle', class: 't-hi halo' }, pct(cur.rel));
    }
    range.addEventListener('input', () => { k = +range.value; draw(); });
    draw(); onResize(draw);
  }

  function powerLab(data) {
    const fig = document.getElementById('lab-power'); if (!fig) return;
    const P = data.power, svg = fig.querySelector('svg'), read = fig.querySelector('[data-role=read]');
    const NAMES = { timbre_depth: 'timbre depth · soft pedal', pedal_clarity: 'pedal clarity · re-articulation' };
    let sc = 'timbre_depth', st = 24;
    const bS = segButtons(fig.querySelector('[data-role=scale]'), Object.entries(NAMES), v => { sc = v; draw(); });
    const bT = segButtons(fig.querySelector('[data-role=stim]'), [[12, '12 stimulus pairs'], [24, '24 stimulus pairs']], v => { st = +v; draw(); });
    function draw() {
      bS.forEach(b => b.setAttribute('aria-pressed', b.dataset.v === sc));
      bT.forEach(b => b.setAttribute('aria-pressed', +b.dataset.v === st));
      const cur = P.curves.find(c => c.scale === sc && c.stimuli === st);
      read.innerHTML = `<span><b>${cur.need80}</b>listeners for 80% power</span><span><b>${P.effects[sc].toFixed(2)}</b>points: half the typical difference between pianists</span>` +
        (sc === 'timbre_depth' ? `<span><b>${pct(P.between_design)}</b>power of the original rating design</span>` : '');
      clear(svg);
      const [W, H] = size(svg), narrow = W < 560;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const maxX = Math.max(...P.curves.flatMap(c => c.points.map(q => q[0])));
      const l = 46, r = 16, t = 14, b = 34, x = scale(0, maxX, l, W - r), y = scale(0, 1, H - b, t);
      const ax = el('g', { class: 'ax' }, svg);
      for (let v = 0; v <= maxX; v += 20) { el('line', { x1: x(v), x2: x(v), y1: t, y2: H - b, stroke: '#1c1c1c' }, ax); txt(ax, { x: x(v), y: H - b + 18, 'text-anchor': 'middle' }, v); }
      [0, .2, .4, .6, .8, 1].forEach(v => { el('line', { x1: l, x2: W - r, y1: y(v), y2: y(v), stroke: '#1c1c1c' }, ax); txt(ax, { x: l - 6, y: y(v), dy: '.35em', 'text-anchor': 'end' }, pct(v)); });
      txt(svg, { x: W - r, y: H - 2, 'text-anchor': 'end', class: 't-muted' }, 'listeners →');
      el('line', { x1: l, x2: W - r, y1: y(.8), y2: y(.8), stroke: '#777', 'stroke-dasharray': '4 4' }, svg);
      if (!narrow) txt(svg, { x: l + 6, y: y(.8) - 8, class: 't-soft' }, '80% power');
      const path = c => c.points.map(([a, q], n) => `${n ? 'L' : 'M'}${x(a).toFixed(1)},${y(q).toFixed(1)}`).join(' ');
      P.curves.filter(c => c !== cur).forEach(c => el('path', { d: path(c), fill: 'none', stroke: '#333', 'stroke-width': 1.3 }, svg));
      el('path', { d: path(cur), fill: 'none', stroke: '#fff', 'stroke-width': 2.2 }, svg);
      el('circle', { cx: x(cur.need80), cy: y(.8), r: 5.5, fill: '#fff', stroke: 'var(--sheet)', 'stroke-width': 2 }, svg);
      txt(svg, { x: x(cur.need80) + 10, y: y(.8) + 20, class: 't-hi halo' }, `${cur.need80} listeners`);
    }
    draw(); onResize(draw);
  }

  citations();
  fetch('data.json').then(r => r.json()).then(data => {
    ratersLab(data); screenLab(data); shortLab(data); powerLab(data);
  }).catch(e => console.error(e));
})();
