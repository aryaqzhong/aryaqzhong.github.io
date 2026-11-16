(() => {
  const X = window.Explainer, { el, scale, clamp, lerp, ease } = X;
  const pct = v => Math.round(v * 100) + '%';
  const seeded = seed => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const shuffle = (n, seed) => { const r = seeded(seed), a = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const narrowOf = stage => stage.clientWidth < 560;
  const hopT = (i, p) => ease(clamp(p / .5));

  function ceiling(data, off = 0) {
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
          const track = el('line', { x1: x(0), x2: x(1), y1: 0, y2: 0, stroke: '#1a1a1a' }, r);
          const ceil = el('rect', { x: x(0), y: -5, height: 10, width: 0, fill: '#3a3a3a' }, r);
          const fill = el('rect', { x: x(0), y: -5, height: 10, width: 0, fill: '#fff' }, r);
          const val = el('text', { x: x(0), y: 0, dy: '.35em', class: 't-muted t-num halo' }, r);
          return { d, r, lab, track, ceil, fill, val };
        });
      },
      update(i, p) {
        const t = hopT(i, p), k = i + off;
        const st = k => ({ y: k <= 1 ? 'raw' : 'ceil', bar: k === 0 ? 0 : 1, kind: k <= 1 ? 'raw' : 'ceil', r2: k >= 3 ? 1 : 0 });
        const A = st(Math.max(0, k - 1)), B = st(k), tt = k === 0 ? 1 : t;
        rows.forEach((row, n) => {
          const d = row.d;
          const ya = y(A.y === 'raw' ? rawRank[n] : n), yb = y(B.y === 'raw' ? rawRank[n] : n);
          row.r.setAttribute('transform', `translate(0,${lerp(ya, yb, tt).toFixed(1)})`);
          const va = A.bar * (A.kind === 'raw' ? d.raw : d.ceiling), vb = B.bar * (B.kind === 'raw' ? d.raw : d.ceiling);
          const v = lerp(va, vb, tt);
          row.ceil.setAttribute('width', Math.max(0, x(v) - x(0)));
          row.ceil.setAttribute('fill', (tt > .5 ? B.kind : A.kind) === 'raw' ? '#4a4a4a' : '#333');
          const r2 = Math.max(0, d.r2) * lerp(A.r2, B.r2, tt);
          row.fill.setAttribute('width', Math.max(0, x(r2) - x(0)));
          const showR2 = k >= 3, focus = k === 4 ? d.id === 'mm_tempo' : k === 5 ? lowShare.has(d.id) : true;
          row.r.setAttribute('opacity', focus ? 1 : .28);
          row.val.setAttribute('x', x(Math.max(v, r2)) + 6);
          row.val.textContent = k === 0 ? '' : showR2 ? `${d.r2.toFixed(2)} of ${d.ceiling.toFixed(2)}` : v.toFixed(2);
        });
        const heads = [
          `<div><b>19</b>scales</div><div><b>9–10</b>experts per performance</div>`,
          `<div><b>0.00–0.81</b>raw agreement</div>`,
          `<div><b>0.62–0.83</b>pedal, pace, timing</div><div><b>0.14–0.23</b>brightness, valence, energy, loudness</div>`,
          `<div><b>21</b>MIDI features</div><div><b>white</b>R² for unseen pianists</div><div><b>gray</b>noise ceiling</div>`,
          `<div><b>0.43</b>R², pace</div><div><b>62%</b>of its ceiling</div>`,
          `<div><b>&lt; 20%</b>interpretation, valence, balance</div>`,
        ];
        big.innerHTML = heads[k];
      },
    };
  }

  function blind(data) {
    const F = data.features, E = data.experts;
    const named = new Set(['Tempo vs. score', 'Sustain depth', 'Mean velocity', 'Rubato', 'Sustain coverage', 'Soft-pedal use', 'Pedal re-articulation']);
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
            t = el('text', { x: x(f.icc) + (right ? 9 : -9), y: y(f.r2) + (below ? 18 : f.label === 'Pedal re-articulation' ? -10 : 4), 'text-anchor': right ? 'start' : 'end', class: 't-muted' }, sc);
            t.textContent = f.label;
          }
          return { f, c, t, y0: y(f.r2), base: VH - 40 };
        });
        ex = el('g', { opacity: 0 }, svg);
        const ex0 = narrow ? 112 : 168, xx = scale(-.5, .5, ex0, VW - 16), rowH = (VH - 70) / E.length;
        el('line', { x1: xx(0), x2: xx(0), y1: 26, y2: VH - 30, stroke: '#444' }, ex);
        [-.5, 0, .5].forEach(v => el('text', { x: xx(v), y: VH - 12, 'text-anchor': 'middle', class: 't-muted' }, ex).textContent = (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1));
        el('text', { x: VW - 16, y: 14, 'text-anchor': 'end', class: 't-muted' }, ex).textContent = 'one seat per expert · filled = their ratings predict it';
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

  function method(data) {
    const dById = Object.fromEntries(data.descriptors.map(d => [d.id, d]));
    const fById = Object.fromEntries(data.features.map(f => [f.id, f]));
    const SC = [['mm_tempo', 'Pace', 'Pace'], ['pedal_amount', 'Pedal amount', 'Pedal amount'], ['timing', 'Timing', 'Timing'], ['interpretation', 'Interpretation', 'Interpretation'], ['timbre_brightness', 'Brightness', 'Brightness']];
    const FE = [['tempo_ratio', 'Tempo vs. score', 'Tempo'], ['pedal_mean_depth', 'Sustain depth', 'Sustain depth'], ['velocity_mean', 'Key velocity', 'Velocity'], ['soft_pedal_ratio', 'Soft-pedal use', 'Soft pedal'], ['pedal_change_rate', 'Pedal re-articulation', 'Re-articulation']];
    const NOTES = [[0, 5, .9], [1, 4, .9], [2, 3, .9], [3, 5, 1.8], [0, 0, 3.7], [2, 2, 1.7], [4, 6, .9], [5, 5, .9], [6, 4, .9], [7, 3, .9], [4, 1, 3.7], [6, 0, 1.8]];
    const span = n => [...Array(n).keys()].map(b => [b * 8 / n, (b + 1) * 8 / n - .1]);
    const PL = [
      { n: 'A', s: 1, v: .85, ped: span(2), soft: [] },
      { n: 'B', s: 1.08, v: .55, ped: span(4), soft: [[0, 7.9]] },
      { n: 'C', s: .93, v: .95, ped: [[0, 7.8]], soft: [] },
      { n: 'D', s: 1.03, v: .7, ped: span(8), soft: [[4, 7.9]] },
    ];
    let svg, big, VW = 640, VH = 436, narrow = false, gRoll, gDia, boxL, boxR, arA, arB, sRows = [], fRows = [];
    const fade = g => { g.style.transition = 'opacity .45s'; return g; };
    return {
      init(stage) {
        svg = stage.querySelector('svg'); big = stage.querySelector('.big');
        narrow = narrowOf(stage);
        if (narrow) VW = 400;
        const rowH = narrow ? 41 : 44, rx0 = 30, rx1 = VW - 6, rnd = seeded(3);
        gRoll = fade(el('g', {}, svg));
        el('text', { x: 0, y: 12, class: 't-muted' }, gRoll).textContent = narrow ? 'one passage · 4 of its ~12 pianists' : 'one passage, four of the ~12 pianists who played it';
        PL.forEach((pl, r) => {
          const y0 = 24 + r * rowH, bx = b => rx0 + b * pl.s / 8.8 * (rx1 - rx0);
          el('text', { x: 4, y: y0 + 14, dy: '.35em', class: 't-soft', style: 'font: italic 400 17px var(--serif)' }, gRoll).textContent = pl.n;
          el('rect', { x: rx0, y: y0, width: rx1 - rx0, height: 26, fill: '#151515' }, gRoll);
          NOTES.forEach(([b, pitch, d]) => {
            const v = clamp(pl.v + (rnd() - .5) * .3, .25, 1), j = (rnd() - .5) * .08;
            el('rect', { x: bx(b + j), y: y0 + 21 - pitch * 3.1, width: Math.max(2, bx(b + j + d * .92) - bx(b + j)), height: 3, fill: '#fff', 'fill-opacity': (.25 + .7 * v).toFixed(2) }, gRoll);
          });
          pl.ped.forEach(([a, b]) => el('rect', { x: bx(a), y: y0 + 31, width: bx(b) - bx(a), height: 1.8, fill: '#8f8f8f' }, gRoll));
          pl.soft.forEach(([a, b]) => el('line', { x1: bx(a), x2: bx(b), y1: y0 + 36.5, y2: y0 + 36.5, stroke: '#8a8a8a', 'stroke-width': 1.4, 'stroke-dasharray': '3 3' }, gRoll));
        });
        const ly = 24 + 4 * rowH + 4;
        el('rect', { x: rx0, y: ly - 1, width: 18, height: 1.8, fill: '#8f8f8f' }, gRoll);
        el('text', { x: rx0 + 24, y: ly, dy: '.35em', class: 't-muted' }, gRoll).textContent = 'sustain pedal';
        el('line', { x1: rx0 + 124, x2: rx0 + 142, y1: ly, y2: ly, stroke: '#8a8a8a', 'stroke-width': 1.4, 'stroke-dasharray': '3 3' }, gRoll);
        el('text', { x: rx0 + 148, y: ly, dy: '.35em', class: 't-muted' }, gRoll).textContent = 'soft pedal';
        if (!narrow) el('text', { x: rx1, y: ly, dy: '.35em', 'text-anchor': 'end', class: 't-muted' }, gRoll).textContent = 'shade = key velocity';

        const top = ly + 16, bw = narrow ? (VW - 80) / 2 : (VW - 130) / 2, bh = 206;
        VH = top + bh + 2; svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
        gDia = fade(el('g', {}, svg));
        const box = (x, title, items, src) => {
          const g = el('g', {}, gDia);
          const frame = el('rect', { x: x + .5, y: top + .5, width: bw - 1, height: bh - 1, fill: '#0d0d0d', stroke: '#2a2a2a' }, g);
          frame.style.transition = 'stroke .4s';
          el('text', { x: x + 12, y: top + 22, class: 't-hi' }, g).textContent = title;
          const rows = items.map(([id, long, short], j) => {
            const iy = top + 50 + j * 32;
            const lab = el('text', { x: x + 12, y: iy, class: 't-soft' }, g); lab.textContent = narrow ? short : long;
            const val = el('text', { x: x + bw - 12, y: iy, 'text-anchor': 'end', class: 't-muted t-num' }, g);
            el('rect', { x: x + 12, y: iy + 7, width: bw - 24, height: 4, fill: '#1c1c1c' }, g);
            const ceil = el('rect', { x: x + 12, y: iy + 7, width: 0, height: 4, fill: '#4a4a4a' }, g);
            const fill = el('rect', { x: x + 12, y: iy + 7, width: 0, height: 4, fill: '#fff' }, g);
            return { id, d: src[id], lab, val, ceil, fill, w: bw - 24 };
          });
          return { g, frame, rows };
        };
        boxL = box(0, narrow ? '21 features' : 'Playing · 21 features', FE, fById);
        boxR = box(VW - bw, narrow ? '19 scales' : 'Ratings · 19 scales', SC, dById);
        fRows = boxL.rows; sRows = boxR.rows;
        const arrow = (y, dir, letter, note) => {
          const g = fade(el('g', {}, gDia)), x0 = bw + 8, x1 = VW - bw - 8;
          const [a, b] = dir > 0 ? [x0, x1] : [x1, x0];
          el('line', { x1: a, x2: b - dir * 7, y1: y, y2: y, stroke: '#fff', 'stroke-width': 1.5 }, g);
          el('path', { d: `M${b},${y} l${-dir * 9},-5 v10 z`, fill: '#fff' }, g);
          el('text', { x: (x0 + x1) / 2, y: y - 10, 'text-anchor': 'middle', class: 't-hi', style: 'font: italic 400 20px var(--serif)' }, g).textContent = letter;
          if (!narrow) el('text', { x: (x0 + x1) / 2, y: y + 18, 'text-anchor': 'middle', class: 't-muted' }, g).textContent = note;
          return g;
        };
        arA = arrow(top + 74, 1, 'A', 'predict each scale');
        arB = arrow(top + 150, -1, 'B', 'predict each habit');
      },
      update(i, p) {
        const t = hopT(i, p);
        gRoll.style.opacity = i === 0 ? 1 : .3;
        gDia.style.opacity = i === 0 ? .22 : 1;
        boxR.frame.setAttribute('stroke', i === 1 || i === 2 ? '#8a8a8a' : '#2a2a2a');
        boxL.frame.setAttribute('stroke', i >= 2 ? '#8a8a8a' : '#2a2a2a');
        boxR.g.style.opacity = i === 3 ? .45 : 1; boxR.g.style.transition = 'opacity .45s';
        boxL.g.style.opacity = i === 1 ? .35 : 1; boxL.g.style.transition = 'opacity .45s';
        arA.style.opacity = i === 2 ? 1 : .18;
        arB.style.opacity = i === 3 ? 1 : .18;
        sRows.forEach(r => {
          const c = i >= 1 ? r.d.ceiling * (i === 1 ? t : 1) : 0, q = i >= 2 ? Math.max(0, r.d.r2) * (i === 2 ? t : 1) : 0;
          r.ceil.setAttribute('width', (c * r.w).toFixed(1)); r.fill.setAttribute('width', (q * r.w).toFixed(1));
          r.val.textContent = i === 0 ? '' : i === 1 ? r.d.ceiling.toFixed(2) : narrow ? r.d.r2.toFixed(2) : `${r.d.r2.toFixed(2)} of ${r.d.ceiling.toFixed(2)}`;
        });
        fRows.forEach(r => {
          const q = i === 3 ? Math.max(0, r.d.r2) * t : 0;
          r.fill.setAttribute('width', (q * r.w).toFixed(1));
          r.val.textContent = i === 3 ? (r.d.r2 < .02 ? '≈ 0' : r.d.r2.toFixed(2)) : '';
          r.lab.setAttribute('class', i === 3 ? (r.d.candidate ? 't-hi' : 't-muted') : 't-soft');
        });
        const heads = [
          `<div><b>99</b>passages</div><div><b>≈ 12</b>pianists play each</div>`,
          `<div><b>0.14–0.83</b>noise ceilings of the 19 scales</div>`,
          `<div><b>A</b>features → each scale</div><div><b>R²</b>for unseen pianists</div>`,
          `<div><b>B</b>scales → each habit</div><div><b>2</b>habits predicted by none</div>`,
        ];
        big.innerHTML = heads[i];
      },
    };
  }

  function rollHero(hero) {
    const canvas = hero.querySelector('canvas'), title = hero.querySelector('h1');
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    const rnd = seeded(5);
    const prog = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59], [57, 60, 64], [50, 53, 57], [52, 56, 59], [57, 60, 64]];
    const notes = []; let t = 0;
    for (let bar = 0; bar < 72; bar++) {
      const ch = prog[bar % prog.length];
      [0, 2].forEach(b => notes.push({ t: t + b * .6 + (rnd() - .5) * .04, p: ch[0] - 12 - (bar % 16 === 15 ? 12 : 0), d: 1.1, v: 60 + rnd() * 25 }));
      const tones = [ch[0], ch[1], ch[2], ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 12, ch[2]];
      for (let k = 0; k < 8; k++) notes.push({ t: t + k * .3 + (rnd() - .5) * .03, p: tones[k], d: .28 + rnd() * .3, v: 45 + rnd() * 40 + (k % 4 === 0 ? 15 : 0) });
      if (rnd() < .8) notes.push({ t: t + (rnd() < .5 ? 0 : 1.2), p: ch[(bar * 7) % 3] + 24, d: 1.1 + rnd(), v: 70 + rnd() * 30 });
      t += 2.4;
    }
    const total = t - 12;
    let W = 0, H = 0, dpr = 1, nowY = 0, raf = 0, visible = true, mx = -1e4, start = performance.now(), last = 0, cur = 8, lastHp = 0;
    const layout = () => {
      dpr = Math.min(2, devicePixelRatio || 1);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      const hb = hero.getBoundingClientRect(), tb = title.getBoundingClientRect();
      nowY = tb.bottom - hb.top + 26;
    };
    const draw = now => {
      raf = 0; if (!visible) return;
      const dt = last ? Math.min(.05, (now - last) / 1000) : 0; last = now;
      const hp = clamp(scrollY / (hero.offsetHeight * .8));
      cur += dt * (1 + hp * 7); if (cur > total) cur -= total;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const px = scale(24, 108, W * .06, W * .94), pps = 58, nw = Math.max(3, (px(25) - px(24)) * .62);
      ctx.strokeStyle = '#1f1f1f'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, nowY + .5); ctx.lineTo(W, nowY + .5); ctx.stroke();
      const fade = 1 - hp * .95;
      for (const n of notes) {
        const y0 = nowY + (n.t - cur) * pps, y1 = y0 + n.d * pps;
        if (y1 < -10 || y0 > H + 10) continue;
        const sounding = n.t <= cur && cur < n.t + n.d, past = cur >= n.t + n.d;
        const x = px(n.p), near = Math.max(0, 1 - Math.abs(x - mx) / 90);
        let a = sounding ? .95 : past ? .16 + .1 * clamp(1 - (cur - n.t - n.d) / 6) : .14 + .2 * (n.v / 127);
        a = clamp((a + near * .35) * fade);
        ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
        ctx.fillRect(x - nw / 2, y0, nw, Math.max(2, y1 - y0 - 1.5));
      }
      if (!X.reduce) raf = requestAnimationFrame(draw);
    };
    const go = () => { if (!raf) raf = requestAnimationFrame(draw); };
    layout(); go();
    let rt = 0;
    addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { layout(); go(); }, 150); });
    hero.addEventListener('pointermove', e => { const b = canvas.getBoundingClientRect(); mx = e.clientX - b.left; go(); });
    hero.addEventListener('pointerleave', () => { mx = -1e4; });
    new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) { last = 0; go(); } }).observe(hero);
    addEventListener('scroll', () => { if (X.reduce && visible) go(); }, { passive: true });
    if (document.fonts) document.fonts.ready.then(() => { layout(); go(); });
  }

  fetch('data.json').then(r => r.json()).then(data => {
    X.scene('method', method(data));
    X.scene('ceiling', ceiling(data, 0));
    X.scene('mapping', ceiling(data, 3));
    X.scene('blind', blind(data));
    X.scene('render', render(data));
  }).catch(e => console.error(e)).then(() => X.boot({ hero: rollHero }));
})();
