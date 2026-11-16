(() => {
  const X = window.Explainer, { el, scale, clamp, lerp, ease } = X;
  const FS = 44100;
  const MONO = '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';
  const fmt = (v, d = 2) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d);
  const hop = (i, p, f = .5) => ease(clamp(p / f));
  const observe = (node, fn) => { const ro = new ResizeObserver(() => fn(node.clientWidth, node.clientHeight)); ro.observe(node); return ro; };
  const clear = n => { while (n.firstChild) n.removeChild(n.firstChild); };
  const txt = (parent, x, y, s, attrs = {}) => { const t = el('text', Object.assign({ x, y }, attrs), parent); t.textContent = s; return t; };
  const fade = (node, v) => node.setAttribute('opacity', clamp(v).toFixed(3));

  function windows(N, M) {
    const h = new Float64Array(M), wa = new Float64Array(N), ws = new Float64Array(N);
    for (let n = 0; n < M; n++) h[n] = .5 - .5 * Math.cos(2 * Math.PI * n / M);
    const L = N - M / 2;
    for (let n = 0; n < L; n++) wa[n] = Math.sqrt(.5 - .5 * Math.cos(Math.PI * n / L));
    for (let n = L; n < N; n++) wa[n] = Math.sqrt(h[n - L + M / 2]);
    for (let n = N - M; n < N; n++) { const v = h[n - N + M] / wa[n]; ws[n] = isFinite(v) ? v : 0; }
    return { wa, ws, h };
  }

  X.scene('window', (() => {
    const states = [
      { title: 'A long window resolves two nearby tones.', stats: ['1024 samples · 23.2 ms wait', '43 Hz between bins'], note: 'Line: normalized spectrum. Dots: the frequencies the STFT samples.', kind: 'spectrum', N: 1024 },
      { title: 'A short window waits less and sees less.', stats: ['128 samples · 2.9 ms wait', '345 Hz between bins'], note: 'Same two tones, same frequency axis; only the window changed.', kind: 'spectrum', N: 128 },
      { title: 'Give analysis and synthesis different jobs.', stats: ['2048 samples analyzed', '128 samples synthesized'], note: 'Both end at now. The long analysis reads history already in the buffer.', kind: 'dual' },
      { title: 'The overlapping frames still add up to one.', stats: ['128-sample Hann product', '64-sample hop'], note: 'An unchanged spectrum is reconstructed exactly; the wait stays at 128 samples.', kind: 'overlap' },
    ];
    let svg, readout, heading, stats, note, panel, W = 0, H = 0, step = 0, renderedStep = -1;
    const spectralCache = new Map();
    function spectrum(N) {
      if (spectralCache.has(N)) return spectralCache.get(N);
      const { wa } = windows(N, N);
      const samples = Array.from(wa, (v, n) => v * (Math.cos(2 * Math.PI * 220 * n / FS) + .85 * Math.cos(2 * Math.PI * 330 * n / FS + .7)));
      const magnitude = f => {
        const angle = -2 * Math.PI * f / FS, c = Math.cos(angle), s = Math.sin(angle);
        let zr = 1, zi = 0, re = 0, im = 0;
        for (const v of samples) { re += v * zr; im += v * zi; const next = zr * c - zi * s; zi = zr * s + zi * c; zr = next; }
        return Math.hypot(re, im);
      };
      const curve = Array.from({ length: 301 }, (_, j) => [j * 2, magnitude(j * 2)]);
      const max = Math.max(...curve.map(p => p[1]));
      const bins = Array.from({ length: Math.floor(600 * N / FS) + 1 }, (_, k) => { const f = k * FS / N; return [f, magnitude(f) / max]; });
      const result = { curve: curve.map(([f, m]) => [f, m / max]), bins };
      spectralCache.set(N, result); return result;
    }
    const line = (x1, y1, x2, y2, color = '#444', attrs = {}) => el('line', { x1, y1, x2, y2, stroke: color, ...attrs }, svg);
    const label = (x, y, text, anchor = 'start', cls = 't-soft') => txt(svg, x, y, text, { class: cls, 'text-anchor': anchor });
    const path = (points, color = '#fff', attrs = {}) => el('path', { d: points.map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' '), fill: 'none', stroke: color, 'stroke-width': 2, ...attrs }, svg);
    function frequency(N) {
      const l = 28, r = W - 16, top = 48, bottom = H - 30;
      const x = scale(0, 600, l, r), y = scale(0, 1, bottom, top);
      label(x(220) - 6, 14, 'voice 220 Hz', 'end', 't-hi');
      label(x(330) + 6, 14, 'band 330 Hz', 'start', 't-soft');
      line(x(220), 20, x(220), 30, '#fff', { 'stroke-width': 2 });
      line(x(330), 20, x(330), 30, '#999', { 'stroke-width': 2 });
      for (const v of [0, .5, 1]) line(l, y(v), r, y(v), v ? '#222' : '#555');
      label(l - 8, y(1) + 4, '1', 'end', 't-muted');
      label(l - 8, y(0) + 4, '0', 'end', 't-muted');
      for (const f of [0, 200, 400, 600]) {
        line(x(f), bottom, x(f), bottom + 4);
        label(x(f), bottom + 20, f === 600 ? '600 Hz' : String(f), f === 0 ? 'start' : f === 600 ? 'end' : 'middle', 't-muted');
      }
      const { curve, bins } = spectrum(N);
      path(curve.map(([f, v]) => [x(f), y(v)]), '#b3b3b3', { 'stroke-width': 1.6 });
      for (const [f, v] of bins) {
        line(x(f), bottom, x(f), y(v), '#444');
        el('circle', { cx: x(f), cy: y(v), r: 3.3, fill: '#fff', stroke: '#0b0b0b', 'stroke-width': 1 }, svg);
      }
    }
    function dual() {
      const l = 12, r = W - 16, x = scale(-2048, 0, l, r), barH = Math.min(46, H * .17);
      const rows = [{ y: H * .27, n: 2048, title: 'Analysis · read 2048 past samples', fill: '#b3b3b3' }, { y: H * .67, n: 128, title: 'Synthesis · keep the last 128', fill: '#fff' }];
      for (const row of rows) {
        label(l, row.y - 14, row.title, 'start', 't-hi');
        el('rect', { x: l, y: row.y, width: r - l, height: barH, fill: '#151515', stroke: '#333' }, svg);
        el('rect', { x: x(-row.n), y: row.y, width: r - x(-row.n), height: barH, fill: row.fill }, svg);
      }
      label(l, H - 8, '2048 samples ago', 'start', 't-muted');
      label(r, H - 8, 'now', 'end', 't-hi');
    }
    function overlap() {
      const l = 28, r = W - 16, rowH = (H - 26) / 3, n = 64;
      const h = k => .5 - .5 * Math.cos(2 * Math.PI * k / 128);
      const rows = [
        ['Earlier frame · fading out', k => h(k + 64), '#999'],
        ['Next frame · fading in', k => h(k), '#ccc'],
        ['Sum · constant weight of 1', k => h(k + 64) + h(k), '#fff'],
      ];
      rows.forEach(([title, fn, color], j) => {
        const row = j * rowH, top = row + 25, bottom = row + rowH - 9;
        label(l, row + 12, title, 'start', j === 2 ? 't-hi' : 't-soft');
        line(l, bottom, r, bottom, '#333');
        label(l - 9, top + 4, '1', 'end', 't-muted');
        label(l - 9, bottom + 4, '0', 'end', 't-muted');
        path(Array.from({ length: n + 1 }, (_, k) => [l + (r - l) * k / n, bottom - fn(k) * (bottom - top)]), color);
      });
      label(l, H - 5, '0', 'start', 't-muted');
      label(r, H - 5, '64 samples · one hop', 'end', 't-muted');
    }
    function draw() {
      if (!svg || !W || !H) return;
      clear(svg); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const state = states[step];
      svg.setAttribute('aria-label', state.title + ' ' + state.stats.join('. ') + '. ' + state.note);
      if (state.kind === 'spectrum') frequency(state.N);
      else if (state.kind === 'dual') dual();
      else overlap();
    }
    function render() {
      if (!heading || renderedStep === step) return;
      renderedStep = step;
      const state = states[step];
      panel.dataset.phase = state.kind;
      heading.textContent = state.title;
      readout.textContent = `${String(step + 1).padStart(2, '0')} / ${String(states.length).padStart(2, '0')}`;
      stats.replaceChildren(...state.stats.map(value => { const span = document.createElement('span'); span.textContent = value; return span; }));
      note.textContent = state.note;
      draw();
    }
    return {
      init(stage) {
        svg = stage.querySelector('svg'); readout = stage.querySelector('.readout'); heading = stage.querySelector('.window-title');
        stats = stage.querySelector('.window-stats'); note = stage.querySelector('.window-note'); panel = stage.querySelector('.window-panel');
        render();
        observe(svg.parentElement, (w, h) => { W = w; H = h; draw(); });
        if (document.fonts) document.fonts.ready.then(draw);
      },
      update(i) { step = i; render(); },
    };
  })());

  function pipelineFig() {
    const fig = document.getElementById('fig-pipeline'); if (!fig) return;
    const svg = fig.querySelector('svg');
    const stages = [
      ['input', '64 samples / block', 'add to past buffer'],
      ['analysis STFT', '2048 past samples', '1025 bins'],
      ['encoder + GRU', 'pool to 64 bands', 'past context only'],
      ['mask head', 'gain 0–1 per bin', 'mixture × mask'],
      ['inverse STFT', '128-sample window', 'add overlaps every 64'],
      ['output', '64 samples / block', 'shifted by 1 hop'],
    ];
    let W = 0, H = 0, pts = [], packet = null, raf = 0, visible = false;
    const loop = t => {
      raf = 0; if (!visible || !packet || pts.length < 2) return;
      const f = X.reduce ? .45 : (t / 5200) % 1, seg = f * (pts.length - 1), k = Math.min(pts.length - 2, Math.floor(seg)), u = seg - k;
      packet.setAttribute('transform', `translate(${lerp(pts[k][0], pts[k + 1][0], u)},${lerp(pts[k][1], pts[k + 1][1], u)})`);
      if (!X.reduce) raf = requestAnimationFrame(loop);
    };
    function build() {
      if (!W || !H) return;
      clear(svg); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const narrow = W < 700, cols = narrow ? 2 : 3, gap = narrow ? 20 : 30;
      const flowW = narrow ? W - 8 : W * .6, bw = (flowW - gap * (cols - 1)) / cols, bh = narrow ? 64 : 88, gy = narrow ? 18 : 34;
      const rows = 6 / cols, totalH = rows * bh + (rows - 1) * gy, top = narrow ? 6 : Math.max(6, (H - totalH - 26) / 2);
      const defs = el('defs', {}, svg), mk = el('marker', { id: 'parr', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' }, defs);
      el('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#777' }, mk);
      const boxes = []; pts = [];
      stages.forEach((lines, i) => {
        const r = Math.floor(i / cols), c = r % 2 === 0 ? i % cols : cols - 1 - i % cols;
        const x = 4 + c * (bw + gap), y = top + r * (bh + gy);
        el('rect', { x, y, width: bw, height: bh, rx: 3, fill: '#121212', stroke: i === 1 || i === 4 ? '#fff' : '#555' }, svg);
        txt(svg, x + 9, y + (narrow ? 17 : 24), `${i + 1} ${lines[0]}`, { class: 't-hi' });
        lines.slice(1).forEach((line, k) => txt(svg, x + 9, y + (narrow ? 35 : 46) + k * 16, line, { class: 't-soft' }));
        boxes.push({ x, y, cx: x + bw / 2, cy: y + bh / 2 });
      });
      boxes.forEach((b, i) => {
        if (i === 0) pts.push([b.x, b.cy]);
        pts.push([b.cx, b.cy]);
        const n = boxes[i + 1];
        if (!n) { pts.push([b.x + bw, b.cy]); return; }
        if (n.cy === b.cy) {
          const fwd = n.x > b.x;
          el('line', { x1: fwd ? b.x + bw : b.x, x2: fwd ? n.x : n.x + bw, y1: b.cy, y2: n.cy, stroke: '#777', 'marker-end': 'url(#parr)' }, svg);
        } else {
          const ym = b.y + bh + gy / 2;
          el('path', { d: `M${b.cx},${b.y + bh} V${ym} H${n.cx} V${n.y}`, fill: 'none', stroke: '#777', 'marker-end': 'url(#parr)' }, svg);
          pts.push([b.cx, ym], [n.cx, ym]);
        }
      });
      txt(svg, 4, top + totalH + 20, narrow ? '□ one 64-sample block · white: the two windows' : '□ one 64-sample block per hop · white boxes: where the two windows act', { class: 't-muted' });
      const cx0 = narrow ? 4 : W * .68, cx1 = W - 6, cy0 = narrow ? top + totalH + 54 : top + 8, barW = cx1 - cx0;
      txt(svg, cx0, cy0, narrow ? 'compute per frame at 5.8 ms' : 'compute per frame at the same 5.8 ms latency', { class: 't-muted' });
      [['B · short · 129 bins', 1.55, '#8a8a8a'], ['C · dual · 1025 bins', 5.84, '#fff']].forEach(([label, v, col], k) => {
        const y = cy0 + 30 + k * (narrow ? 52 : 64);
        txt(svg, cx0, y, label, { class: 't-soft' });
        txt(svg, cx1, y, `${v.toFixed(2)} MMAC`, { class: 't-hi t-num', 'text-anchor': 'end' });
        el('rect', { x: cx0, y: y + 10, width: barW * v / 6, height: narrow ? 16 : 22, fill: col }, svg);
      });
      if (!narrow) txt(svg, cx0, cy0 + 30 + 2 * 64 + 4, 'per-bin layers dominate the cost', { class: 't-muted' });
      packet = el('g', {}, svg); el('rect', { x: -4, y: -4, width: 8, height: 8, fill: '#fff', rx: 1 }, packet);
      if (visible && !raf) raf = requestAnimationFrame(loop);
    }
    observe(svg.parentElement, (w, h) => { W = w; H = h; build(); });
    new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible && !raf) raf = requestAnimationFrame(loop); }).observe(svg);
  }

  function oracle(data) {
    const V = data.oracle.validation;
    let svg, big, W = 0, H = 0, gO, dual = [], dualLbl, brk, inset, built = false, cur = { i: 0, p: 0 };
    function build() {
      clear(svg); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const narrow = W < 520;
      gO = el('g', {}, svg);
      const left = narrow ? 44 : 56, right = W - 34, top = 52, bottom = H - 40;
      const x = v => scale(Math.log2(2.9), Math.log2(23.22), left, right)(Math.log2(v)), y = scale(7, 11.5, bottom, top);
      const ax = el('g', { class: 'ax' }, gO);
      [2.9, 5.8, 11.61, 23.22].forEach(v => { el('line', { x1: x(v), x2: x(v), y1: top, y2: bottom, stroke: '#1f1f1f' }, ax); txt(ax, x(v), bottom + 16, `${v.toFixed(1)} ms`, { 'text-anchor': 'middle' }); });
      [7, 8, 9, 10, 11].forEach(v => { el('line', { x1: left - 4, x2: right, y1: y(v), y2: y(v), stroke: '#1f1f1f' }, ax); txt(ax, left - 8, y(v), `${v} dB`, { 'text-anchor': 'end', dy: '.35em' }); });
      txt(gO, right, bottom + 32, 'algorithmic latency →', { class: 't-muted', 'text-anchor': 'end' });
      txt(gO, left, 10, '↑ uSDR with ideal ratio masks', { class: 't-muted' });
      const sym = V.filter(v => v.N === v.M).sort((a, b) => a.latency_ms - b.latency_ms);
      el('path', { d: sym.map((v, k) => `${k ? 'L' : 'M'}${x(v.latency_ms).toFixed(1)},${y(v.sdr).toFixed(1)}`).join(' '), fill: 'none', stroke: '#8a8a8a', 'stroke-width': 1.6 }, gO);
      sym.forEach(v => { el('circle', { cx: x(v.latency_ms), cy: y(v.sdr), r: 4.5, fill: '#8a8a8a' }, gO); txt(gO, x(v.latency_ms), y(v.sdr) + 20, `${v.N}`, { class: 't-muted', 'text-anchor': 'middle' }); });
      txt(gO, right, y(8.5), narrow ? 'gray: symmetric windows' : 'gray: symmetric windows · analysis = synthesis', { class: 't-soft', 'text-anchor': 'end' });
      dual = V.filter(v => v.N !== v.M).map(v => {
        const g = el('g', { opacity: 0 }, gO);
        el('circle', { cx: x(v.latency_ms), cy: y(v.sdr), r: 5, fill: v.N === 2048 ? '#fff' : '#0b0b0b', stroke: '#fff', 'stroke-width': 1.5 }, g);
        if (!narrow || v.N === 2048) txt(g, x(v.latency_ms) + 10, y(v.sdr) + (v.N === 4096 ? 14 : v.N === 1024 ? 6 : -7), `${v.N} / ${v.M}`, { class: v.N === 2048 ? 't-hi' : 't-muted' });
        return g;
      });
      dualLbl = txt(gO, left, 30, narrow ? 'white: dual · labels = N / M' : 'white: dual windows · labels = analysis / synthesis samples', { class: 't-hi', opacity: 0 });
      brk = el('g', { opacity: 0 }, gO);
      el('line', { x1: x(5.8) - 14, x2: x(5.8) - 14, y1: y(8.57), y2: y(10.06), stroke: '#fff' }, brk);
      el('line', { x1: x(5.8) - 18, x2: x(5.8) - 10, y1: y(8.57), y2: y(8.57), stroke: '#fff' }, brk);
      el('line', { x1: x(5.8) - 18, x2: x(5.8) - 10, y1: y(10.06), y2: y(10.06), stroke: '#fff' }, brk);
      txt(brk, x(5.8) - 22, narrow ? y(10.2) : (y(8.57) + y(10.06)) / 2 + 4, narrow ? '+1.5 dB' : '+1.5 dB', { class: 't-hi t-num', 'text-anchor': 'end' });
      inset = el('g', { opacity: 0 }, gO);
      const ix = left, iy = Math.max(72, H * .25), iw = right - ix, sc = v => ix + v / 2 * iw;
      txt(inset, ix, iy - 20, narrow ? 'Test set · paired SI-SDR · 5.8 ms' : 'Test set · paired SI-SDR gain at 5.8 ms', { class: 't-muted' });
      [['ideal masks', 1.87, '#8a8a8a'], ['trained models', .76, '#fff']].forEach(([l, v, col], k) => {
        const yy = iy + k * 76;
        txt(inset, ix, yy, l, { class: 't-soft' });
        txt(inset, right, yy, `${fmt(v)} dB`, { class: 't-hi t-num', 'text-anchor': 'end' });
        el('rect', { x: ix, y: yy + 12, width: sc(v) - ix, height: 24, fill: col }, inset);
      });
      txt(inset, ix, iy + 150, '≈ 40% of the oracle gain realized', { class: 't-hi' });
      built = true; render();
    }
    function render() {
      if (!built) return;
      const { i, p } = cur, t = hop(i, p, .5);
      const showDual = i === 1 ? t : i > 1 ? 1 : 0;
      dual.forEach(g => fade(g, showDual)); fade(dualLbl, showDual);
      fade(brk, i === 1 ? t : i > 1 ? 1 : 0);
      fade(inset, i === 2 ? 1 : 0);
      [...gO.children].forEach(g => { if (g !== inset) g.style.visibility = i === 2 ? 'hidden' : ''; });
      const heads = [
        `<div><b>10.9 → 7.8 dB</b>ideal masks, symmetric 23.2 → 2.9 ms</div>`,
        `<div><b>10.06 dB</b>dual 2048 / 256 at 5.8 ms</div><div><b>9.52 dB</b>symmetric at 11.6 ms</div>`,
        `<div><b>+1.87 dB</b>oracle gain, positive on every song</div><div><b>+0.76 dB</b>trained · ≈ 40%</div>`,
      ];
      big.innerHTML = heads[i];
    }
    return { init(stage) { svg = stage.querySelector('svg'); big = stage.querySelector('.big'); observe(svg.parentElement, (w, h) => { W = w; H = h; build(); }); }, update(i, p) { cur = { i, p }; render(); } };
  }

  function gains(data) {
    const P = data.paired, keys = ['C-B', 'D-E', 'D-Ew', 'D-E'];
    const cfg = k => data.configs.find(c => c.key === k);
    const meta = [
      { lat: '5.8 ms', a: cfg('B').si_sdr_median, b: cfg('C').si_sdr_median, what: 'short → dual window, median song' },
      { lat: '2.9 ms', a: cfg('E').si_sdr_median, b: cfg('D').si_sdr_median, what: 'short → dual window, median song' },
      { lat: '2.9 ms', a: data.wide.Ew, b: cfg('D').si_sdr_median, what: 'wider short → dual, same compute' },
    ];
    const n = data.tracks.length, hd = data.tracks.indexOf('PR - Happy Daze');
    const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
    const mid = a => { const q = [...a].sort((x, y) => x - y), m = q.length >> 1; return q.length % 2 ? q[m] : (q[m - 1] + q[m]) / 2; };
    const rest = P['D-E'].values.filter((_, j) => j !== hd), meanRest = avg(rest), medRest = mid(rest);
    const ranks = keys.map(k => { const v = P[k].values, order = v.map((val, j) => [val, j]).sort((a, b) => a[0] - b[0]), r = new Array(n); order.forEach(([, j], q) => { r[j] = q; }); return r; });
    const clipv = v => Math.max(-3, Math.min(3, v));
    let svg, big, W = 0, H = 0, left, right, step, bw, y, bars = [], medLine, medText, meanLine, meanText, hdLabel, hdLead, gBars, cur = { i: 0, p: 0 }, built = false;
    function build() {
      clear(svg); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const narrow = W < 520;
      gBars = el('g', {}, svg);
      left = narrow ? 30 : 56; right = W - 12; step = (right - left) / n; bw = Math.max(2, Math.min(12, step * .6));
      y = scale(-3, 3, H - 30, 16);
      const ax = el('g', { class: 'ax' }, gBars);
      for (let t = -3; t <= 3; t++) {
        el('line', { x1: left - 6, x2: right, y1: y(t), y2: y(t), stroke: t === 0 ? '#5a5a5a' : '#1e1e1e' }, ax);
        txt(ax, left - 10, y(t), t === 0 ? '0' : t === 3 ? '+3 dB' : fmt(t, 0), { dy: '.35em', 'text-anchor': 'end' });
      }
      txt(gBars, right, H - 8, narrow ? 'test songs, sorted by gain →' : 'one bar per MUSDB18-HQ test song, sorted by the gain of the dual window →', { 'text-anchor': 'end', class: 't-muted' });
      const g = el('g', {}, gBars);
      bars = Array.from({ length: n }, (_, j) => { const r = el('rect', { width: bw.toFixed(1), rx: 1 }, g); r.titleEl = el('title', {}, r); r.titleEl.textContent = data.tracks[j]; return r; });
      meanLine = el('line', { x1: left, x2: right, stroke: '#9a9a9a', 'stroke-dasharray': '2 4', opacity: 0 }, gBars);
      meanText = txt(gBars, right, 0, '', { class: 't-soft t-num halo', 'text-anchor': 'end', opacity: 0 });
      medLine = el('line', { x1: left, x2: right, stroke: '#fff', 'stroke-dasharray': '4 3' }, gBars);
      medText = txt(gBars, left + 4, 0, '', { class: 't-hi t-num halo' });
      hdLead = el('path', { fill: 'none', stroke: '#9a9a9a', opacity: 0 }, gBars);
      hdLabel = txt(gBars, 0, 0, '', { class: 't-hi halo', opacity: 0 });
      built = true; render();
    }
    function render() {
      if (!built) return;
      const { i, p } = cur, t = hop(i, p, .45), ib = Math.min(i, 3), ia = Math.max(0, ib - 1);
      const va = P[keys[ia]].values, vb = P[keys[ib]].values, ra = ranks[ia], rb = ranks[ib], y0 = y(0), tt = i > 3 ? 1 : t;
      bars.forEach((b, j) => {
        const rank = ib === 0 ? rb[j] : lerp(ra[j], rb[j], tt);
        const v = ib === 0 ? lerp(0, clipv(vb[j]), tt) : lerp(clipv(va[j]), clipv(vb[j]), tt);
        const x = left + rank * step + (step - bw) / 2, y1 = y(v), hi = ib === 3 && j === hd;
        b.setAttribute('x', x.toFixed(1)); b.setAttribute('y', Math.min(y0, y1).toFixed(1)); b.setAttribute('height', Math.max(.6, Math.abs(y1 - y0)).toFixed(1));
        b.setAttribute('fill', hi ? '#fff' : v >= 0 ? '#e6e6e6' : '#5a5a5a');
        b.setAttribute('opacity', ib === 3 && !hi ? .3 : 1);
        if (tt > .99) b.titleEl.textContent = `${data.tracks[j]}: ${fmt(vb[j])} dB`;
      });
      const med = lerp(ib === 0 ? 0 : P[keys[ia]].median, P[keys[ib]].median, tt);
      medLine.setAttribute('y1', y(med)); medLine.setAttribute('y2', y(med));
      medText.setAttribute('y', y(med) - 6); medText.textContent = `median ${fmt(med)} dB`;
      const sm = ib === 3 ? tt : 0, mean = P[keys[ib]].mean;
      meanLine.setAttribute('y1', y(mean)); meanLine.setAttribute('y2', y(mean)); meanLine.setAttribute('opacity', sm);
      meanText.setAttribute('y', y(mean) + 15); meanText.setAttribute('opacity', sm); meanText.textContent = `mean ${fmt(mean)} dB`;
      const hx = left + rb[hd] * step + step / 2, ly = y(-2.1);
      hdLead.setAttribute('d', `M${hx.toFixed(1)},${y(-3)} L${(hx + 12).toFixed(1)},${ly + 4} L${(hx + 18).toFixed(1)},${ly + 4}`); hdLead.setAttribute('opacity', sm);
      hdLabel.setAttribute('x', hx + 22); hdLabel.setAttribute('y', ly + 8); hdLabel.setAttribute('opacity', sm);
      hdLabel.textContent = `PR – Happy Daze: ${fmt(vb[hd], 0)} dB, clipped`;
      if (i === 3) big.innerHTML = `<div><b>${fmt(P['D-E'].mean)} → ${fmt(meanRest)} dB</b>mean, without this one song</div><div><b>${fmt(P['D-E'].median)} → ${fmt(medRest)} dB</b>median</div>`;
      else { const m = meta[i], pb = P[keys[i]]; big.innerHTML = `<div><b>${m.lat}</b>latency</div><div><b>${m.a.toFixed(2)} → ${m.b.toFixed(2)}</b>${m.what}</div><div><b>${pb.better} of ${pb.n}</b>songs improve</div>`; }
    }
    return { init(stage) { svg = stage.querySelector('svg'); big = stage.querySelector('.big'); observe(svg.parentElement, (w, h) => { W = w; H = h; build(); }); }, update(i, p) { cur = { i, p }; render(); } };
  }

  function prefix(data) {
    const LC = data.latency_check;
    let svg, big, W = 0, H = 0, gSig, outs, brk, m2, built = false, cur = { i: 0, p: 0 };
    const NS = 600, NDIV = 330, LOOK = 123;
    const base = k => .5 * Math.sin(k * .09) + .3 * Math.sin(k * .23 + 1) + .2 * Math.sin(k * .41 + 2);
    const alt = k => .45 * Math.sin(k * .13 + 2) + .35 * Math.sin(k * .31) + .2 * Math.sin(k * .5 + 1);
    const inA = k => base(k), inB = k => k < NDIV ? base(k) : lerp(base(k), alt(k), clamp((k - NDIV) / 40));
    const smooth = f => k => { let s = 0; for (let j = -6; j <= 6; j++) s += f(k + j); return s / 13; };
    const outA = smooth(inA), outB0 = smooth(inB);
    const outB = k => k < NDIV - LOOK ? outA(k) : lerp(outA(k), outB0(k) + .25 * Math.sin((k - NDIV + LOOK) * .2), clamp((k - NDIV + LOOK) / 60));
    function build() {
      clear(svg); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const narrow = W < 520, left = narrow ? 70 : 120, right = W - 16, x = scale(0, NS, left, right);
      gSig = el('g', {}, svg);
      const rows = [['input 1', inA, '#8a8a8a'], ['input 2', inB, '#fff'], ['output 1', outA, '#8a8a8a'], ['output 2', outB, '#fff']];
      const rowH = Math.min(90, (H - 80) / 4), amp = rowH * .32, top = 40;
      outs = el('g', { opacity: 0 }, gSig);
      rows.forEach(([name, f, col], r) => {
        const cy = top + r * rowH + rowH / 2, parent = r < 2 ? gSig : outs;
        txt(parent, left - 10, cy, name, { class: r % 2 ? 't-hi' : 't-soft', 'text-anchor': 'end', dy: '.35em' });
        el('line', { x1: left, x2: right, y1: cy, y2: cy, stroke: '#1f1f1f' }, parent);
        let d = ''; for (let k = 0; k <= NS; k += 2) d += `${k ? 'L' : 'M'}${x(k).toFixed(1)},${(cy - f(k) * amp).toFixed(1)}`;
        el('path', { d, fill: 'none', stroke: col, 'stroke-width': 1.3 }, parent);
      });
      const yTop = top - 10, yBot = top + rowH * 4 - 6;
      el('line', { x1: x(NDIV), x2: x(NDIV), y1: yTop, y2: yBot, stroke: '#fff', 'stroke-dasharray': '4 3' }, gSig);
      txt(gSig, right, yTop - 8, narrow ? 'inputs change at n' : 'inputs change at n · time →', { class: 't-hi', 'text-anchor': 'end' });
      m2 = el('g', { opacity: 0 }, gSig);
      el('line', { x1: x(NDIV - LOOK), x2: x(NDIV - LOOK), y1: top + rowH * 2 - 10, y2: yBot, stroke: '#fff', 'stroke-dasharray': '4 3' }, m2);
      txt(m2, x(NDIV - LOOK) - 6, top + rowH * 2 + 2, narrow ? 'n − 123' : 'the outputs part here, before n', { class: 't-hi', 'text-anchor': 'end' });
      brk = el('g', { opacity: 0 }, gSig);
      const yb = yBot + 14;
      el('path', { d: `M${x(NDIV - LOOK)},${yb - 5} V${yb} H${x(NDIV)} V${yb - 5}`, fill: 'none', stroke: '#fff' }, brk);
      txt(brk, narrow ? right : (x(NDIV - LOOK) + x(NDIV)) / 2, yb + 16, narrow ? '123 samples look-ahead · bound 127' : 'look-ahead: 123 samples · bound 127 = synthesis window − 1', { class: 't-hi t-num', 'text-anchor': narrow ? 'end' : 'middle' });
      built = true; render();
    }
    function render() {
      if (!built) return;
      const { i, p } = cur, t = hop(i, p, .5);
      fade(outs, i === 1 ? t : i > 1 ? 1 : 0); fade(m2, i === 1 ? clamp((t - .3) / .7) : i > 1 ? 1 : 0); fade(brk, i === 1 ? clamp((t - .5) / .5) : i > 1 ? 1 : 0);
      const heads = [`<div><b>n</b>the first sample that differs</div>`, `<div><b>123 ≤ 127</b>samples look-ahead at 2.9 ms</div><div><b>247 ≤ 255</b>at 5.8 ms</div><div><b>1 hop</b>impulse delay of the code</div>`];
      big.innerHTML = heads[i];
    }
    return { init(stage) { svg = stage.querySelector('svg'); big = stage.querySelector('.big'); observe(svg.parentElement, (w, h) => { W = w; H = h; build(); }); }, update(i, p) { cur = { i, p }; render(); } };
  }

  function deadline(data) {
    const D = data.configs.find(c => c.key === 'D'), E = data.configs.find(c => c.key === 'E');
    const hopMs = D.hop_ms, SPAN = hopMs * 6;
    const rows = [
      { label: '2.9 ms dual window · ONNX Runtime', ms: D.rtf * hopMs, note: `${(D.rtf * hopMs).toFixed(2)} ms per hop` },
      { label: '2.9 ms short window · ONNX Runtime', ms: E.rtf * hopMs, note: `${(E.rtf * hopMs).toFixed(2)} ms per hop` },
      { label: '2.9 ms dual window · eager PyTorch', ms: data.torch_D.rtf * hopMs, note: `${(data.torch_D.rtf * hopMs).toFixed(2)} ms per hop · every hop late`, short: `${(data.torch_D.rtf * hopMs).toFixed(2)} ms · late` },
    ];
    let svg, big, W = 0, H = 0, x, head, groups = [], raf = 0, visible = false, t0 = performance.now(), step = 0, built = false;
    const loop = t => {
      raf = 0; if (!visible || !built) return;
      const play = X.reduce ? SPAN : ((t - t0) / 2600 % 1) * SPAN;
      head.setAttribute('x1', x(play)); head.setAttribute('x2', x(play));
      groups.forEach(g => g.bars.forEach((b, k) => {
        const s = k * hopMs, w = Math.max(0, Math.min(g.row.ms, play - s));
        b.setAttribute('width', Math.max(0, x(s + w) - x(s)));
        if (b.over) b.over.setAttribute('opacity', g.row.ms > hopMs && play - s > hopMs ? 1 : 0);
      }));
      if (!X.reduce) raf = requestAnimationFrame(loop);
    };
    function build() {
      clear(svg); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const narrow = W < 520;
      const gRace = el('g', {}, svg);
      x = scale(0, SPAN, 4, W - 4);
      const defs = el('defs', {}, svg), pat = el('pattern', { id: 'hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
      el('rect', { width: 6, height: 6, fill: '#0b0b0b' }, pat); el('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: '#fff', 'stroke-width': 2 }, pat);
      const rowH = Math.min(124, Math.max(68, (H - 80) / 3)), barH = Math.min(46, rowH - 50), top = Math.max(50, (H - rowH * 3) / 2 + 30);
      head = el('line', { y1: top - 24, y2: top + rowH - 34, stroke: '#fff', 'stroke-width': 1.2, opacity: .55 }, gRace);
      head.rowH = rowH; head.top = top;
      const ax = el('g', { class: 'ax' }, gRace);
      for (let k = 0; k <= 6; k++) {
        el('line', { x1: x(k * hopMs), x2: x(k * hopMs), y1: top - 20, y2: top - 14, stroke: '#444' }, ax);
        if (!narrow || k % 2 === 0) txt(ax, x(k * hopMs), top - 26, `${(k * hopMs).toFixed(2)} ms`, { 'text-anchor': k === 0 ? 'start' : k === 6 ? 'end' : 'middle' });
      }
      txt(gRace, x(0), top - 44, narrow ? 'slot = one 1.45 ms hop · bar = compute time' : 'each slot is one 1.45 ms hop; the bar is the time spent computing it, in slow motion', { class: 't-muted' });
      groups = [];
      rows.forEach((row, r) => {
        const gy = top + r * rowH, g = el('g', { opacity: 0, style: 'transition: opacity .5s' }, gRace);
        txt(g, x(0), gy, narrow ? row.label.replace('2.9 ms ', '').replace(' · ONNX Runtime', '') : row.label, { class: 't-soft halo' });
        txt(g, x(SPAN), gy, narrow && row.short ? row.short : (narrow ? row.note.replace(' per hop', '') : row.note), { class: 't-hi t-num halo', 'text-anchor': 'end' });
        const bars = [];
        for (let k = 0; k < 6; k++) {
          el('rect', { x: x(k * hopMs) + 1, y: gy + 10, width: x(hopMs) - x(0) - 2, height: barH, fill: 'none', stroke: '#2e2e2e' }, g);
          const b = el('rect', { x: x(k * hopMs) + 1, y: gy + 10, height: barH, width: 0, fill: row.ms > hopMs ? 'url(#hatch)' : '#fff' }, g);
          if (row.ms > hopMs) b.over = txt(g, x((k + 1) * hopMs) - 4, gy + 10 + barH + 14, 'late', { 'text-anchor': 'end', class: 't-muted', opacity: 0 });
          bars.push(b);
        }
        groups.push({ g, bars, row });
      });
      built = true; paint();
      if (visible && !raf) raf = requestAnimationFrame(loop);
    }
    function paint() {
      if (!built) return;
      groups.forEach((g, r) => g.g.setAttribute('opacity', r <= step ? 1 : 0));
      head.setAttribute('y2', head.top + head.rowH * (step + 1) - 34);
    }
    return {
      init(stage) {
        svg = stage.querySelector('svg'); big = stage.querySelector('.big');
        observe(svg.parentElement, (w, h) => { W = w; H = h; build(); });
        new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible && !raf) raf = requestAnimationFrame(loop); }).observe(svg);
      },
      update(i) {
        step = i; paint();
        const cells = [
          [`<div><b>${D.p99_ms.toFixed(2)} ms</b>99th percentile per hop</div>`, `<div><b>${hopMs.toFixed(2)} ms</b>budget per hop</div>`, `<div><b>${D.late_pct.toFixed(2)}%</b>late hops</div>`],
          [`<div><b>${D.rtf.toFixed(3)}</b>real-time factor, dual</div>`, `<div><b>${E.rtf.toFixed(3)}</b>real-time factor, short</div>`],
          [`<div><b>${data.torch_D.rtf.toFixed(2)}</b>real-time factor, eager PyTorch</div>`, `<div><b>${data.torch_D.late_pct.toFixed(0)}%</b>late hops</div>`],
        ];
        big.innerHTML = cells[i].join('');
        if (X.reduce) loop(performance.now());
      },
    };
  }

  function tradeoffFig(data) {
    const fig = document.getElementById('fig-tradeoff'); if (!fig) return;
    const svg = fig.querySelector('svg');
    let W = 0, H = 0;
    function build() {
      if (!W || !H) return;
      clear(svg); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const narrow = W < 560, tl = narrow ? 44 : 60, tr = W - (narrow ? 14 : 40), tt = 26, tb = H - 44;
      const tx = scale(0, 6.5, tl, tr), ty = scale(2.8, 5, tb, tt);
      const ax = el('g', { class: 'ax' }, svg);
      [0, 1, 2, 3, 4, 5, 6].forEach(v => { el('line', { x1: tx(v), x2: tx(v), y1: tt, y2: tb, stroke: '#1f1f1f' }, ax); txt(ax, tx(v), tb + 16, String(v), { 'text-anchor': 'middle' }); });
      [3, 3.5, 4, 4.5, 5].forEach(v => { el('line', { x1: tl - 4, x2: tr, y1: ty(v), y2: ty(v), stroke: '#1f1f1f' }, ax); txt(ax, tl - 8, ty(v), narrow ? v.toFixed(1) : `${v.toFixed(1)} dB`, { 'text-anchor': 'end', dy: '.35em' }); });
      txt(svg, tr, tb + 34, narrow ? 'MMAC per frame →' : 'million multiply-adds per frame →', { class: 't-muted', 'text-anchor': 'end' });
      txt(svg, tl, 12, narrow ? '↑ median vocal SI-SDR (dB)' : '↑ vocal SI-SDR, median over the 50 test songs', { class: 't-muted' });
      const pt = {}; data.configs.forEach(c => { pt[c.key] = [tx(c.mmac), ty(c.si_sdr_median)]; });
      [['B', 'C', data.paired['C-B'].median, '5.8'], ['E', 'D', data.paired['D-E'].median, '2.9']].forEach(([a, b, g, lat], k) => {
        el('line', { x1: pt[a][0], x2: pt[b][0], y1: pt[a][1], y2: pt[b][1], stroke: '#555', 'stroke-dasharray': '4 3' }, svg);
        txt(svg, narrow ? tr : tx(3.1), ty(k ? 3.06 : 3.24), narrow ? `${b} − ${a}  ${fmt(g)} dB` : `${b} − ${a}: ${fmt(g)} dB per song at ${lat} ms`, { class: 't-soft t-num', 'text-anchor': narrow ? 'end' : 'start' });
      });
      const place = { A: [12, 4, 'start'], B: [-12, -12, 'end'], C: [-12, -8, 'end'], D: [-12, 14, 'end'], E: [12, 20, 'start'] };
      data.configs.forEach(c => {
        const dual = c.kind === 'dual', [px, py] = pt[c.key], [dx, dy, anchor] = place[c.key];
        el('circle', { cx: px, cy: py, r: 6, fill: dual ? '#fff' : c.kind === 'long' ? '#0b0b0b' : '#8a8a8a', stroke: '#fff', 'stroke-width': dual || c.kind === 'long' ? 1.5 : 0 }, svg);
        const lbl = narrow ? `${c.key} · ${c.latency_ms.toFixed(1)} ms` : `${c.key} · ${c.kind} · ${c.latency_ms.toFixed(1)} ms`;
        txt(svg, px + dx, py + dy, lbl, { class: dual ? 't-hi' : 't-soft', 'text-anchor': anchor });
      });
    }
    observe(svg.parentElement, (w, h) => { W = w; H = h; build(); });
  }

  function budget() {
    const fig = document.querySelector('.budget'); if (!fig) return;
    const svg = fig.querySelector('svg');
    const marks = [
      { ms: 1000 / FS, up: false, anchor: 'start', l1: 'one sample', l2: '0.023 ms', narrow: true },
      { ms: 2.9, up: true, anchor: 'end', l1: '2.9 ms · 128 samples · this work', l2: 'sound crosses one meter of stage', hi: true, narrow: true, n1: '2.9 ms · this work', n2: 'sound crosses 1 m' },
      { ms: 5.8, up: false, anchor: 'end', l1: '5.8 ms · 256 samples · this work', l2: '', hi: true },
      { ms: 16.7, up: false, anchor: 'start', l1: '16.7 ms', l2: 'one frame at 60 fps' },
      { ms: 23.2, up: true, anchor: 'start', l1: '23.2 ms · 1024 samples', l2: 'model A', narrow: true, n1: '23.2 ms', n2: 'model A' },
      { ms: 3000, up: true, anchor: 'end', l1: 'seconds of future audio', l2: 'offline separators (HTDemucs)', range: [1000, 10000], narrow: true, n1: 'seconds', n2: 'offline models' },
    ];
    let built = 0;
    function build() {
      const W = fig.clientWidth; if (!W || W === built) return; built = W;
      clear(svg);
      const narrow = W < 560, H = 180, ay = 96;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const x = scale(-2, 4, 8, W - 8), lx = ms => x(Math.log10(ms));
      for (let d = -2; d <= 4; d++) {
        el('line', { x1: x(d), x2: x(d), y1: ay - 5, y2: ay + 5, class: 'dec' }, svg);
        const labtxt = d <= 2 ? `${10 ** d} ms` : `${10 ** (d - 3)} s`;
        if (!narrow || d % 2 === 0) txt(svg, x(d), ay + 22, labtxt, { 'text-anchor': d === -2 ? 'start' : d === 4 ? 'end' : 'middle' });
      }
      const axis = el('line', { x1: x(-2), x2: x(4), y1: ay, y2: ay, class: 'axis' }, svg);
      const len = x(4) - x(-2); axis.setAttribute('stroke-dasharray', len); axis.setAttribute('stroke-dashoffset', fig.classList.contains('in') ? 0 : len);
      let k = 0;
      marks.forEach(m => {
        if (narrow && !m.narrow) return;
        const g = el('g', { class: 'mk' + (m.hi ? ' hi' : '') }, svg);
        g.style.transitionDelay = `${.25 + k * .18}s`; k++;
        const px = lx(m.ms), ax0 = m.range ? lx(m.range[1]) : px, ty = m.up ? ay - 40 : ay + 46;
        if (m.range) el('rect', { x: lx(m.range[0]), y: ay - 7, width: lx(m.range[1]) - lx(m.range[0]), height: 14, rx: 2 }, g);
        el('line', { x1: ax0, x2: ax0, y1: m.up ? ay - 8 : ay + 8, y2: m.up ? ty + 8 : ty - 22 }, g);
        el('circle', { cx: px, cy: ay, r: m.range ? 2.5 : 3.5 }, g);
        const dx = m.anchor === 'start' ? 5 : m.anchor === 'end' ? -5 : 0;
        txt(g, ax0 + dx, m.up ? ty - 6 : ty - 2, narrow && m.n1 ? m.n1 : m.l1, { 'text-anchor': m.anchor, class: m.hi ? 'hi' : 'soft' });
        const l2 = narrow && m.n2 !== undefined ? m.n2 : m.l2;
        if (l2) txt(g, ax0 + dx, m.up ? ty + 8 : ty + 12, l2, { 'text-anchor': m.anchor });
      });
    }
    observe(fig, build);
    new IntersectionObserver(es => { if (es[0].isIntersecting) { fig.classList.add('in'); const a = svg.querySelector('.axis'); if (a) a.setAttribute('stroke-dashoffset', 0); } }, { threshold: .35 }).observe(fig);
  }

  async function lensHero(hero) {
    const canvas = hero.querySelector('canvas'), title = hero.querySelector('h1'), res = hero.querySelector('.hero-res');
    if (!canvas || !title || !canvas.getContext) return;
    try { await Promise.all([document.fonts.load('500 80px "Instrument Sans"'), document.fonts.load('400 12px "JetBrains Mono"')]); } catch (e) {}
    const ctx = canvas.getContext('2d'), text = title.textContent.trim();
    const STAGES = [[24, 128], [16, 256], [10, 512], [6, 1024], [3, 2048]], STEP = .4;
    let W = 0, H = 0, dpr = 1, font = '', spacing = '0px', cy = 0, th = 0, k = 1, box = null, I = null, iw = 0;
    let raf = 0, visible = true, mx = -1e4, my = -1e4, start = 0, shown = '';
    const say = s => { if (res && s !== shown) { res.textContent = s; shown = s; } };
    const layout = () => {
      dpr = Math.min(2, devicePixelRatio || 1);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      const hb = hero.getBoundingClientRect(), tb = title.getBoundingClientRect(), cs = getComputedStyle(title);
      font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; spacing = cs.letterSpacing;
      cy = tb.top - hb.top + tb.height / 2; th = parseFloat(cs.fontSize); k = th / 96;
      const m = document.createElement('canvas').getContext('2d'); m.font = font; m.letterSpacing = spacing;
      const tw = m.measureText(text).width;
      box = { x0: Math.max(0, Math.floor(W / 2 - tw / 2 - 10)), y0: Math.max(0, Math.floor(cy - th * .62)), x1: Math.min(Math.ceil(W), Math.ceil(W / 2 + tw / 2 + 10)), y1: Math.min(Math.ceil(H), Math.ceil(cy + th * .62)) };
      const bw = box.x1 - box.x0, bh = box.y1 - box.y0, off = document.createElement('canvas'); off.width = bw; off.height = bh;
      const o = off.getContext('2d'); o.font = font; o.letterSpacing = spacing; o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillStyle = '#fff';
      o.fillText(text, W / 2 - box.x0, cy - box.y0);
      const a = o.getImageData(0, 0, bw, bh).data; iw = bw + 1; I = new Float32Array(iw * (bh + 1));
      for (let y = 0; y < bh; y++) { let row = 0; for (let x = 0; x < bw; x++) { row += a[(y * bw + x) * 4 + 3]; I[(y + 1) * iw + x + 1] = I[y * iw + x + 1] + row; } }
      hero.classList.add('particles-on');
    };
    const cover = (x0, y0, x1, y1) => {
      x0 = Math.max(0, Math.round(x0 - box.x0)); y0 = Math.max(0, Math.round(y0 - box.y0));
      x1 = Math.min(iw - 1, Math.round(x1 - box.x0)); y1 = Math.min(box.y1 - box.y0, Math.round(y1 - box.y0));
      const n = (x1 - x0) * (y1 - y0); if (n <= 0) return 0;
      return (I[y1 * iw + x1] - I[y0 * iw + x1] - I[y1 * iw + x0] + I[y0 * iw + x0]) / (n * 255);
    };
    const cells = (c, alpha, t, lim) => {
      c = Math.max(2, Math.round(c)); const gap = c >= 5 ? 1 : 0;
      const L = lim || box, ox = box.x0 + (((W / 2 - box.x0) % c) + c) % c - c;
      ctx.fillStyle = '#e8e8e8';
      for (let y = box.y0; y < box.y1; y += c) {
        if (y + c < L.y0 || y > L.y1) continue;
        for (let x = ox; x < box.x1; x += c) {
          if (x + c < L.x0 || x > L.x1) continue;
          const v = cover(x, y, x + c, y + c); if (v < .05) continue;
          ctx.globalAlpha = clamp(Math.pow(v, .8) * alpha * (.8 + .2 * Math.sin(x * .045 - t * 3.1 + y * .02)));
          ctx.fillRect(x + gap / 2, y + gap / 2, c - gap, c - gap);
        }
      }
      ctx.globalAlpha = 1;
    };
    const crisp = t => {
      ctx.font = font; ctx.letterSpacing = spacing; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#d2d2d2'; ctx.fillText(text, W / 2, cy);
      const period = 6.5, u = ((t - 2.4) % period) / period, sx = lerp(box.x0 - 160, box.x1 + 160, u);
      if (t > 2.4 && !X.reduce) {
        ctx.save(); ctx.globalCompositeOperation = 'source-atop';
        const g = ctx.createLinearGradient(sx - 120, 0, sx + 120, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0); ctx.restore();
      }
    };
    const axis = () => {
      ctx.strokeStyle = '#222'; ctx.lineWidth = 1; ctx.beginPath();
      ctx.moveTo(0, cy + .5); ctx.lineTo(box.x0 - 18, cy + .5); ctx.moveTo(box.x1 + 18, cy + .5); ctx.lineTo(W, cy + .5);
      for (let x = (W / 2) % 48; x < W; x += 48) { if (x > box.x0 - 18 && x < box.x1 + 18) continue; ctx.moveTo(x + .5, cy - 4); ctx.lineTo(x + .5, cy + 4); }
      ctx.stroke();
    };
    const final = 'analysis window 2048 samples · synthesis window 128 · 2.9 ms wait', finalShort = 'analysis 2048 · synthesis 128 · 2.9 ms wait';
    const stageText = n => W < 560 ? `analysis window ${n} · bins ${Math.round(FS / n)} Hz` : `analysis window ${n} samples · bins ${Math.round(FS / n)} Hz apart`;
    const draw = now => {
      raf = 0; if (!visible || !box) return;
      if (!start) start = now;
      const t = Math.max(0, (now - start) / 1000), hp = clamp(scrollY / (hero.offsetHeight * .8));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      axis();
      const stage = Math.floor(t / STEP);
      if (X.reduce) { crisp(99); say(W < 560 ? finalShort : final); return; }
      if (stage < STAGES.length) {
        const f = ease(clamp((t - stage * STEP) / (STEP * .8))), sx = lerp(box.x0 - 4, box.x1 + 4, f);
        const cNew = STAGES[stage][0] * k, cOld = stage ? STAGES[stage - 1][0] * k : 36 * k;
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, sx, H); ctx.clip(); cells(cNew, 1, t); ctx.restore();
        ctx.save(); ctx.beginPath(); ctx.rect(sx, 0, W - sx, H); ctx.clip(); cells(cOld, stage ? 1 : f * .9 + .1, t); ctx.restore();
        if (f < 1) {
          const g = ctx.createLinearGradient(sx - 50, 0, sx, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,.22)');
          ctx.fillStyle = g; ctx.fillRect(sx - 50, box.y0 - 8, 50, box.y1 - box.y0 + 16);
          ctx.fillStyle = '#fff'; ctx.fillRect(sx, box.y0 - 8, 1, box.y1 - box.y0 + 16);
        }
        say(stageText(STAGES[stage][1]));
      } else if (hp > .015) {
        cells(lerp(3, 34, ease(hp)) * k, 1 - hp * .95, t);
        const n = Math.max(128, Math.round(2048 / Math.pow(2, Math.round(hp * 4))));
        say(stageText(n));
      } else {
        crisp(t); say(W < 560 ? finalShort : final);
        const r = clamp(th * .64, 38, 76);
        if (mx > -1e3 && mx > box.x0 - r && mx < box.x1 + r && my > box.y0 - r && my < box.y1 + r) {
          const lim = { x0: mx - r, y0: my - r, x1: mx + r, y1: my + r };
          ctx.save(); ctx.beginPath(); ctx.arc(mx, my, r, 0, 6.283); ctx.clip();
          ctx.fillStyle = '#0b0b0b'; ctx.fillRect(lim.x0, lim.y0, 2 * r, 2 * r);
          cells(14 * k, 1, t, lim); ctx.restore();
          ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(mx, my, r, 0, 6.283); ctx.stroke();
          say(W < 560 ? 'lens: a 256-sample window · 172 Hz bins' : 'inside the lens: what a 256-sample window sees · bins 172 Hz apart');
        }
      }
      raf = requestAnimationFrame(draw);
    };
    const go = () => { if (!raf) raf = requestAnimationFrame(draw); };
    layout(); go();
    let rt = 0;
    addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { layout(); go(); }, 150); });
    hero.addEventListener('pointermove', e => { const b = canvas.getBoundingClientRect(); mx = e.clientX - b.left; my = e.clientY - b.top; go(); });
    hero.addEventListener('pointerleave', () => { mx = my = -1e4; });
    new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) go(); }).observe(hero);
    addEventListener('scroll', () => { if (visible) go(); }, { passive: true });
  }

  fetch('data.json').then(r => r.json()).then(data => {
    X.scene('oracle', oracle(data));
    X.scene('gains', gains(data));
    X.scene('prefix', prefix(data));
    X.scene('deadline', deadline(data));
    pipelineFig(); tradeoffFig(data);
  }).catch(e => console.error(e)).then(() => { budget(); X.boot({ hero: lensHero }); });
})();
