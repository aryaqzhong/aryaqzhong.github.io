(() => {
  const X = window.Explainer, { el, scale, clamp, lerp, ease } = X;
  const pct = v => Math.round(v * 100) + '%';
  const seeded = seed => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const shuffle = (n, seed) => { const r = seeded(seed), a = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const narrowOf = stage => stage.clientWidth < 560;

  function ceiling(data) {
    const D = data.descriptors, n = D.length;
    const rawRank = D.map((d, i) => [d.raw, i]).sort((a, b) => b[0] - a[0]).reduce((acc, [, i], r) => { acc[i] = r; return acc; }, []);
    let svg, big, rows = [], VW = 640, VH = 470, labelW = 168, x, y;
    const lowShare = new Set(D.filter(d => d.share < .2).map(d => d.id));
    return {
      init(stage) {
        svg = stage.querySelector('svg'); big = stage.querySelector('.big');
        if (narrowOf(stage)) { VW = 400; VH = 440; labelW = 128; }
        svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
        x = scale(0, 1, labelW + 8, VW - 44); y = r => 22 + r * ((VH - 36) / n);
        const ax = el('g', { class: 'ax' }, svg);
        [0, .25, .5, .75, 1].forEach(v => {
          el('line', { x1: x(v), x2: x(v), y1: 10, y2: VH - 8, stroke: v ? '#1c1c1c' : '#333' }, ax);
          el('text', { x: x(v), y: 6, 'text-anchor': 'middle' }, ax).textContent = pct(v);
        });
        const g = el('g', {}, svg);
        rows = D.map(d => {
          const r = el('g', {}, g);
          const lab = el('text', { x: labelW, y: 0, 'text-anchor': 'end', class: 't-soft', dy: '.35em' }, r); lab.textContent = d.short;
          const ceil = el('rect', { x: x(0), y: -6, height: 12, width: 0, fill: '#3a3a3a' }, r);
          const fill = el('rect', { x: x(0), y: -6, height: 12, width: 0, fill: '#fff' }, r);
          const val = el('text', { x: x(0), y: 0, dy: '.35em', class: 't-muted t-num halo' }, r);
          return { d, r, lab, ceil, fill, val };
        });
      },
      update(i, p) {
        const t = hopT(i, p);
        const st = k => ({
          y: k <= 1 ? 'raw' : 'ceil',
          bar: k === 0 ? 0 : 1,
          kind: k <= 1 ? 'raw' : 'ceil',
          r2: k >= 3 ? 1 : 0,
        });
        const A = st(Math.max(0, i - 1)), B = st(i), tt = i === 0 ? 1 : t;
        rows.forEach((row, k) => {
          const d = row.d;
          const ya = y(A.y === 'raw' ? rawRank[k] : k), yb = y(B.y === 'raw' ? rawRank[k] : k);
          row.r.setAttribute('transform', `translate(0,${lerp(ya, yb, tt).toFixed(1)})`);
          const va = A.bar * (A.kind === 'raw' ? d.raw : d.ceiling), vb = B.bar * (B.kind === 'raw' ? d.raw : d.ceiling);
          const v = lerp(va, vb, tt);
          row.ceil.setAttribute('width', Math.max(0, x(v) - x(0)));
          row.ceil.setAttribute('fill', (tt > .5 ? B.kind : A.kind) === 'raw' ? '#4a4a4a' : '#333');
          const r2 = Math.max(0, d.r2) * lerp(A.r2, B.r2, tt);
          row.fill.setAttribute('width', Math.max(0, x(r2) - x(0)));
          const showR2 = i >= 3, focus = i === 4 ? d.id === 'mm_tempo' : i === 5 ? lowShare.has(d.id) : true;
          row.r.setAttribute('opacity', focus ? 1 : .28);
          row.val.setAttribute('x', x(Math.max(v, r2)) + 6);
          row.val.textContent = i === 0 ? '' : showR2 ? `${d.r2.toFixed(2)} of ${d.ceiling.toFixed(2)}` : v.toFixed(2);
        });
        const heads = [
          `<div><b>19</b>descriptor scales</div><div><b>9–10</b>experts per segment</div>`,
          `<div><b>0.00–0.81</b>raw agreement</div>`,
          `<div><b>0.62–0.83</b>pedal, pace, timing</div><div><b>0.14–0.23</b>brightness, valence, energy, loudness</div>`,
          `<div><b>21</b>MIDI features</div><div><b>white</b>R² for unseen pianists</div><div><b>gray</b>noise ceiling</div>`,
          `<div><b>0.43</b>R², pace</div><div><b>62%</b>of its ceiling</div>`,
          `<div><b>&lt; 20%</b>interpretation, valence, balance</div>`,
        ];
        big.innerHTML = heads[i];
      },
    };
  }
  const hopT = (i, p) => ease(clamp(p / .5));

  function blind(data) {
    const F = data.features, E = data.experts;
    const named = new Set(['Tempo vs. score', 'Sustain depth', 'Mean velocity', 'Rubato', 'Sustain coverage', 'Soft-pedal use', 'Pedal change rate']);
    let svg, big, sc, ex, dots = [], VW = 640, VH = 440, region, regionLbl, narrow = false;
    return {
      init(stage) {
        svg = stage.querySelector('svg'); big = stage.querySelector('.big');
        narrow = narrowOf(stage); if (narrow) { VW = 400; VH = 400; }
        svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
        const x = scale(0, .5, 40, VW - 16), y = scale(-.05, .55, VH - 40, 16);
        sc = el('g', {}, svg);
        const ax = el('g', { class: 'ax' }, sc);
        [0, .1, .2, .3, .4, .5].forEach(v => { el('line', { x1: x(v), x2: x(v), y1: 12, y2: VH - 40, stroke: '#1c1c1c' }, ax); el('text', { x: x(v), y: VH - 22, 'text-anchor': 'middle' }, ax).textContent = v.toFixed(1); });
        [0, .1, .2, .3, .4, .5].forEach(v => { el('line', { x1: 40, x2: VW - 16, y1: y(v), y2: y(v), stroke: v ? '#1c1c1c' : '#333' }, ax); el('text', { x: 34, y: y(v), dy: '.35em', 'text-anchor': 'end' }, ax).textContent = v.toFixed(1); });
        el('text', { x: VW - 16, y: VH - 4, 'text-anchor': 'end', class: 't-muted' }, sc).textContent = narrow ? 'consistent habit (ICC) →' : 'how consistent the habit is for a pianist (ICC) →';
        el('text', { x: 40, y: 8, class: 't-muted' }, sc).textContent = narrow ? '↑ predicted from ratings (R²)' : '↑ how well the 19 ratings predict it (R²)';
        region = el('rect', { x: x(.3), y: y(.1), width: x(.5) - x(.3), height: y(-.05) - y(.1), fill: 'rgba(255,255,255,.07)', stroke: '#555', 'stroke-dasharray': '3 3', opacity: 0 }, sc);
        regionLbl = el('text', { x: x(.5) - 4, y: y(.1) - 8, 'text-anchor': 'end', class: 't-soft', opacity: 0 }, sc); regionLbl.textContent = 'consistent, not predicted';
        dots = F.map(f => {
          const c = el('circle', { cx: x(f.icc), cy: y(f.r2), r: 4.5, fill: '#8a8a8a' }, sc);
          let t = null;
          if (named.has(f.label)) {
            const right = f.icc < .33, below = f.label === 'Soft-pedal use';
            t = el('text', { x: x(f.icc) + (right ? 9 : -9), y: y(f.r2) + (below ? 18 : f.label === 'Pedal change rate' ? -10 : 4), 'text-anchor': right ? 'start' : 'end', class: 't-muted' }, sc);
            t.textContent = f.label;
          }
          return { f, c, t, y0: y(f.r2), base: VH - 40 };
        });
        ex = el('g', { opacity: 0 }, svg);
        const ex0 = narrow ? 112 : 168, xx = scale(-.5, .5, ex0, VW - 16), rowH = (VH - 70) / E.length;
        el('line', { x1: xx(0), x2: xx(0), y1: 26, y2: VH - 30, stroke: '#444' }, ex);
        [-.5, 0, .5].forEach(v => el('text', { x: xx(v), y: VH - 12, 'text-anchor': 'middle', class: 't-muted' }, ex).textContent = (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1));
        el('text', { x: VW - 16, y: 14, 'text-anchor': 'end', class: 't-muted' }, ex).textContent = 'one dot per expert · filled = their ratings predict it';
        E.forEach((e, r) => {
          const gy = 52 + r * rowH;
          el('text', { x: ex0 - 12, y: gy, dy: '.35em', 'text-anchor': 'end', class: e.role === 'candidate' ? 't-hi' : 't-soft' }, ex).textContent = narrow ? e.label.replace('Pedal re-articulation', 'Re-articulation').replace(' vs. score', '') : e.label;
          el('text', { x: ex0 - 12, y: gy + 16, dy: '.35em', 'text-anchor': 'end', class: 't-muted t-num' }, ex).textContent = `${e.hits} of ${e.n}`;
          e.r2.forEach((v, k) => {
            const jitter = ((k * 37) % 9 - 4) * 1.6;
            el('circle', { cx: xx(v), cy: gy + jitter, r: 3.2, fill: e.sig[k] ? '#fff' : 'none', stroke: e.sig[k] ? 'none' : '#6a6a6a' }, ex);
          });
        });
      },
      update(i, p) {
        const t = hopT(i, p);
        const appear = i === 0 ? t : 1;
        dots.forEach(d => {
          const cand = d.f.candidate, hi = i >= 1 && cand;
          d.c.setAttribute('cy', lerp(d.base, d.y0, appear).toFixed(1));
          d.c.setAttribute('fill', hi ? '#fff' : '#8a8a8a'); d.c.setAttribute('r', hi ? 6 : 4.5);
          d.c.setAttribute('opacity', i >= 1 && !cand ? .45 : 1);
          if (d.t) { d.t.setAttribute('class', hi ? 't-hi' : 't-muted'); d.t.setAttribute('opacity', appear); }
        });
        const reg = i === 1 ? t : i > 1 ? 1 : 0;
        region.setAttribute('opacity', reg); regionLbl.setAttribute('opacity', reg);
        const sw = i === 2 ? t : 0;
        sc.setAttribute('opacity', 1 - sw); ex.setAttribute('opacity', sw);
        ex.setAttribute('transform', `translate(${(1 - sw) * 24},0)`);
        const heads = [
          `<div><b>${F.length}</b>MIDI habits</div><div><b>20</b>pianists</div>`,
          `<div><b>≈ 0.31</b>performer ICC</div><div><b>R² ≈ 0</b>from the 19 ratings</div>`,
          `<div><b>0 of 47</b>experts track soft pedal</div><div><b>3 of 47</b>track re-articulation</div><div><b>35 of 47</b>track tempo</div>`,
        ];
        big.innerHTML = heads[i];
      },
    };
  }

  function render(data) {
    const R = data.render, N = R.performances;
    let svg, big, cells = [], VW = 640, VH = 420, cols = 34;
    const order = shuffle(N, 7), rank = new Array(N); order.forEach((c, r) => { rank[c] = r; });
    const shortSet = new Set(shuffle(N, 11).slice(0, N - R.identical_soft));
    const keep = new Set(shuffle(N, 23).slice(0, R.identical_sustain));
    return {
      init(stage) {
        svg = stage.querySelector('svg'); big = stage.querySelector('.big');
        if (narrowOf(stage)) { VW = 400; VH = 420; cols = 26; }
        const rowsN = Math.ceil(N / cols), size = Math.min((VW - 4) / cols, (VH - 40) / rowsN);
        svg.setAttribute('viewBox', `0 0 ${VW} ${Math.ceil(rowsN * size + 40)}`);
        for (let k = 0; k < N; k++) {
          const c = k % cols, r = Math.floor(k / cols);
          cells.push(el('rect', { x: 2 + c * size + 1, y: 30 + r * size + 1, width: size - 2, height: size - 2, fill: 'none', stroke: '#1b1b1b' }, svg));
        }
        el('text', { x: 2, y: 16, class: 't-muted' }, svg).textContent = 'one square per rendered performance (Yamaha C5 grand samples)';
      },
      update(i, p) {
        const t = clamp(p / .7);
        const filled = i === 0 ? 0 : i === 1 ? Math.round(t * N) : N;
        const flipped = i === 2 ? Math.round(t * N) : 0;
        cells.forEach((c, k) => {
          const on = rank[k] < filled, changed = i === 2 && !keep.has(k) && rank[k] < flipped;
          if (!on) { c.setAttribute('fill', 'none'); c.setAttribute('stroke', '#1b1b1b'); return; }
          if (changed) { c.setAttribute('fill', '#171717'); c.setAttribute('stroke', '#5a5a5a'); return; }
          c.setAttribute('stroke', 'none');
          c.setAttribute('fill', i === 1 && shortSet.has(k) ? '#8a8a8a' : '#fff');
        });
        const shown = Math.min(filled, N);
        const heads = [
          `<div><b>${N}</b>performances with soft-pedal events</div>`,
          `<div><b>${Math.round(shown * R.identical_soft / N)} / ${N}</b>sample-identical without the soft pedal</div><div><b>${Math.round(shown * R.identical_until_end / N)}</b>identical until the shorter file ends</div>`,
          `<div><b>${Math.round(clamp(flipped / N) * (N - R.identical_sustain))} / ${N}</b>changed without the sustain pedal</div>`,
        ];
        big.innerHTML = heads[i];
      },
    };
  }

  function power(data) {
    const C = data.power.curves;
    let svg, big, paths = [], marks = [], VW = 640, VH = 420, note, narrow = false;
    return {
      init(stage) {
        svg = stage.querySelector('svg'); big = stage.querySelector('.big');
        narrow = narrowOf(stage); if (narrow) { VW = 400; VH = 380; }
        svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
        const x = scale(0, 100, 44, VW - 16), y = scale(0, 1, VH - 40, 18);
        const ax = el('g', { class: 'ax' }, svg);
        [0, 20, 40, 60, 80, 100].forEach(v => { el('line', { x1: x(v), x2: x(v), y1: 18, y2: VH - 40, stroke: '#1c1c1c' }, ax); el('text', { x: x(v), y: VH - 22, 'text-anchor': 'middle' }, ax).textContent = v; });
        [0, .2, .4, .6, .8, 1].forEach(v => { el('line', { x1: 44, x2: VW - 16, y1: y(v), y2: y(v), stroke: '#1c1c1c' }, ax); el('text', { x: 38, y: y(v), dy: '.35em', 'text-anchor': 'end' }, ax).textContent = pct(v); });
        el('line', { x1: 44, x2: VW - 16, y1: y(.8), y2: y(.8), stroke: '#777', 'stroke-dasharray': '4 4' }, svg);
        el('text', { x: VW - 16, y: y(.8) - 8, 'text-anchor': 'end', class: 't-soft' }, svg).textContent = '80% power';
        el('text', { x: VW - 16, y: VH - 4, 'text-anchor': 'end', class: 't-muted' }, svg).textContent = 'listeners →';
        C.forEach(c => {
          const d = c.points.map(([a, b], k) => `${k ? 'L' : 'M'}${x(a).toFixed(1)},${y(b).toFixed(1)}`).join(' ');
          const timbre = c.scale === 'timbre_depth';
          const path = el('path', { d, fill: 'none', stroke: timbre ? '#fff' : '#8a8a8a', 'stroke-width': c.stimuli === 24 ? 2 : 1.4, 'stroke-dasharray': c.stimuli === 24 ? '' : '5 4' }, svg);
          const len = path.getTotalLength(); path.dataset.len = len;
          path.style.strokeDasharray = c.stimuli === 24 ? `${len} ${len}` : '5 4'; path.style.strokeDashoffset = len;
          paths.push({ c, path, len });
          if (c.need80 && c.stimuli === 24) {
            const m = el('g', { opacity: 0 }, svg);
            el('circle', { cx: x(c.need80), cy: y(.8), r: 5, fill: timbre ? '#fff' : '#8a8a8a' }, m);
            el('text', { x: x(c.need80) + (timbre ? 10 : -10), y: y(.8) + (timbre ? 22 : -14), 'text-anchor': timbre ? 'start' : 'end', class: timbre ? 't-hi' : 't-soft' }, m).textContent = `${c.need80} listeners`;
            marks.push({ c, m });
          }
        });
        note = el('text', { x: x(30), y: y(.08), class: 't-soft', opacity: 0 }, svg);
        note.textContent = `original design: ${pct(data.power.between_design)} power`;
        const lg = el('g', {}, svg), lx = x(narrow ? 50 : 58), ly = y(.4);
        [['timbre depth', '#fff'], ['pedal clarity', '#8a8a8a']].forEach(([lab, col], k) => {
          el('line', { x1: lx, x2: lx + 18, y1: ly + k * 18, y2: ly + k * 18, stroke: col, 'stroke-width': 2 }, lg);
          el('text', { x: lx + 24, y: ly + k * 18, dy: '.35em', class: 't-soft' }, lg).textContent = lab;
        });
        el('text', { x: lx, y: ly + 40, dy: '.35em', class: 't-muted' }, lg).textContent = narrow ? 'solid 24 pairs · dashed 12' : 'solid: 24 stimulus pairs · dashed: 12';
      },
      update(i, p) {
        const t = clamp(p / .6);
        paths.forEach(({ c, path, len }) => {
          const k = c.scale === 'timbre_depth' ? 1 : 2, f = i < k ? 0 : i === k ? t : 1;
          if (c.stimuli === 24) path.style.strokeDashoffset = (len * (1 - f)).toFixed(1);
          path.style.opacity = c.stimuli === 24 ? 1 : f;
        });
        marks.forEach(({ c, m }) => { const k = c.scale === 'timbre_depth' ? 1 : 2; m.setAttribute('opacity', i < k ? 0 : i === k ? clamp((t - .7) / .3) : 1); });
        note.setAttribute('opacity', i === 2 ? clamp((t - .5) / .5) : 0);
        const heads = [
          `<div><b>paired</b>same notes, pedal changed</div><div><b>random</b>listeners and stimuli</div>`,
          `<div><b>29</b>listeners · 24 pairs</div><div><b>67</b>listeners · 12 pairs</div>`,
          `<div><b>13</b>listeners for pedal clarity</div><div><b>${pct(data.power.between_design)}</b>power of the original design</div>`,
        ];
        big.innerHTML = heads[i];
      },
    };
  }

  fetch('data.json').then(r => r.json()).then(data => {
    X.scene('ceiling', ceiling(data));
    X.scene('blind', blind(data));
    X.scene('render', render(data));
    X.scene('power', power(data));
    X.boot({ mode: 'roll' });
  }).catch(e => { console.error(e); X.boot({ mode: 'roll' }); });
})();
