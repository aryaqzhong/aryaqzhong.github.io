(() => {
  const X = window.Explainer, { el, scale, clamp, lerp, ease } = X;
  const FS = 44100;
  const MONO = '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';
  const fmt = (v, d = 2) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d);
  const hop = (i, p, f = .5) => ease(clamp(p / f));
  const glerp = (a, b, t) => Math.exp(lerp(Math.log(a), Math.log(b), t));
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

  const VOICE = [220, 440, 660, 880, 1100, 1320, 1540].map((f, k) => ({ f, a: [1, .82, .62, .5, .4, .32, .26][k], ph: (k * 2.39) % 6.28 }));
  const BAND = [330, 550, 770, 990, 1210, 1430].map((f, k) => ({ f, a: [.72, .6, .5, .42, .33, .26][k], ph: (k * 1.71 + 1) % 6.28 }));
  const PARTIALS = VOICE.concat(BAND), FMAX = 1650, NF = 330, AMP = 7;
  const sig = n => { let s = 0; for (const p of PARTIALS) s += p.a * Math.cos(2 * Math.PI * p.f * n / FS + p.ph); return Math.max(-1, Math.min(1, s / AMP)); };
  const cache = new Map();
  function spectrum(N, M) {
    const key = N + ':' + M;
    if (cache.has(key)) return cache.get(key);
    const { wa } = windows(N, M), x = new Float64Array(N);
    for (let n = 0; n < N; n++) { let s = 0; for (const p of PARTIALS) s += p.a * Math.cos(2 * Math.PI * p.f * n / FS + p.ph); x[n] = s * wa[n]; }
    const mag = new Float64Array(NF);
    for (let j = 0; j < NF; j++) {
      const w = -2 * Math.PI * (j / (NF - 1) * FMAX) / FS, c = Math.cos(w), s = Math.sin(w);
      let zr = 1, zi = 0, re = 0, im = 0;
      for (let n = 0; n < N; n++) { re += x[n] * zr; im += x[n] * zi; const t = zr * c - zi * s; zi = zr * s + zi * c; zr = t; }
      mag[j] = Math.hypot(re, im);
    }
    let mx = 0; for (const v of mag) mx = Math.max(mx, v);
    const db = Array.from(mag, v => Math.max(-48, 20 * Math.log10(v / mx + 1e-12)));
    if (cache.size > 400) cache.clear();
    cache.set(key, db);
    return db;
  }

  X.scene('window', (() => {
    const S = [
      { N: 1024, M: 1024, span: 2304, ola: 0, mark: 0, spec: 0 },
      { N: 1024, M: 1024, span: 2304, ola: 0, mark: 0, spec: 1 },
      { N: 256, M: 256, span: 2304, ola: 0, mark: 0, spec: 1 },
      { N: 128, M: 128, span: 2304, ola: 0, mark: 0, spec: 1 },
      { N: 2048, M: 128, span: 2304, ola: 0, mark: 0, spec: 1 },
      { N: 2048, M: 128, span: 420, ola: 1, mark: 0, spec: 1 },
      { N: 2048, M: 128, span: 2304, ola: 0, mark: 1, spec: 1 },
    ];
    let canvas, ctx, readout, legendItems, W = 0, H = 0, dpr = 1, cur = S[0], raf = 0, visible = false, tape = 0, lastT = 0;
    const even = v => Math.max(2, Math.round(v / 2) * 2);
    const label = (text, x, y, align, color) => {
      ctx.textAlign = align; const w = ctx.measureText(text).width, x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
      ctx.fillStyle = '#0b0b0b'; ctx.fillRect(x0 - 3, y - 10, w + 6, 14);
      ctx.fillStyle = color; ctx.fillText(text, x, y);
    };
    function draw() {
      if (!W || !H) return;
      const N = even(cur.N), M = even(Math.min(cur.M, N));
      const { wa, ws } = windows(N, M);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      ctx.font = `11px ${MONO}`;
      const narrow = W < 520, pad = 2;
      const top0 = 16, topH = H * (narrow ? .22 : .34), base = top0 + topH, amp = topH * .3;
      const by = base + amp + 18, bot0 = by + 50, botH = Math.max(35, H - bot0 - 26);
      const span = cur.span, x0 = pad, x1 = W - 14;
      const tx = scale(-span, 0, x0, x1), ty = scale(0, 1.15, base, top0);
      const pxs = (x1 - x0) / span;
      ctx.strokeStyle = '#262626'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, base + .5); ctx.lineTo(W - pad, base + .5); ctx.stroke();
      const curve = (arr, start, close) => {
        ctx.beginPath(); let first = true;
        for (let n = start; n < arr.length; n++) {
          const t = n - arr.length; if (t < -span) continue;
          const px = tx(t), py = ty(arr[n]);
          if (first) { ctx.moveTo(px, close ? ty(0) : py); if (close) ctx.lineTo(px, py); first = false; } else ctx.lineTo(px, py);
        }
        if (close) { ctx.lineTo(tx(0), ty(0)); ctx.closePath(); }
      };
      curve(wa, 0, true); ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fill();
      ctx.beginPath();
      for (let px = x0; px <= x1; px++) { const t = (px - x0) / pxs - span, y = base - sig(t + tape) * amp; px === x0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y); }
      ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); let first = true;
      for (let px = Math.max(x0, Math.floor(tx(-N))); px <= x1; px++) {
        const t = (px - x0) / pxs - span, idx = Math.round(N + t);
        if (idx < 0 || idx >= N) continue;
        const y = base - sig(t + tape) * wa[idx] * amp;
        first ? ctx.moveTo(px, y) : ctx.lineTo(px, y); first = false;
      }
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
      curve(wa, 0, false); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      if (N > M) { curve(ws, N - M, false); ctx.setLineDash([4, 3]); ctx.strokeStyle = '#9a9a9a'; ctx.lineWidth = 1.3; ctx.stroke(); ctx.setLineDash([]); }
      if (cur.ola > .01) {
        ctx.globalAlpha = cur.ola;
        const h = Array.from({ length: M }, (_, n) => .5 - .5 * Math.cos(2 * Math.PI * n / M));
        for (let k = 0; k < 6; k++) {
          const end = -k * M / 2; ctx.beginPath();
          h.forEach((v, n) => { const t = end - M + n; const px = tx(t), py = ty(v * .98); n ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
          ctx.strokeStyle = k === 0 ? '#fff' : '#5e5e5e'; ctx.lineWidth = k === 0 ? 1.8 : 1.2; ctx.stroke();
        }
        ctx.setLineDash([5, 4]); ctx.strokeStyle = '#d0d0d0'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(tx(-3 * M), ty(.98)); ctx.lineTo(tx(-M / 2), ty(.98)); ctx.stroke(); ctx.setLineDash([]);
        label(narrow ? 'overlapped windows sum to 1' : 'analysis × synthesis = Hann(128); overlapped every 64 samples they sum to 1', tx(-3 * M) + 2, ty(.98) - 8, 'left', '#d0d0d0');
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(tx(0) + .5, top0 - 8); ctx.lineTo(tx(0) + .5, base + amp + 6); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.fillText('now', tx(0) - 6, top0 - 1);
      const ticks = span > 1000 ? [[-2048, narrow ? '−2048' : '2048 samples ago · 46 ms'], [-1024, narrow ? '−1024' : '1024 · 23 ms']] : [[-384, '−384'], [-256, '−256'], [-128, '−128 samples']];
      ctx.fillStyle = '#6a6a6a'; ctx.textAlign = 'center';
      for (const [t, s] of ticks) { if (tx(t) < x0 + (narrow ? 24 : 130)) continue; ctx.fillRect(tx(t), base - 3, 1, 7); ctx.fillText(s, tx(t), base + amp + 12); }
      label('time →', x0 + 2, top0 - 1, 'left', '#9a9a9a');
      const bx0 = tx(-M), bx1 = tx(0);
      ctx.strokeStyle = cur.mark > .5 ? '#fff' : '#9a9a9a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bx0, by - 5); ctx.lineTo(bx0, by); ctx.lineTo(bx1, by); ctx.lineTo(bx1, by - 5); ctx.stroke();
      label(`wait ${M} samples = ${(M / FS * 1000).toFixed(1)} ms`, bx1, by + 16, 'right', cur.mark > .5 ? '#fff' : '#b3b3b3');
      if (cur.mark > .01) { ctx.globalAlpha = cur.mark; label(narrow ? 'measured look-ahead 123 ≤ 127' : 'measured look-ahead: 123 samples (bound 127)', bx1, by + 32, 'right', '#fff'); ctx.globalAlpha = 1; }
      const lx = Math.max(x0 + 2, tx(-N) + 4);
      if (cur.ola < .5) label(N > M ? `analysis window · ${N} samples` : `window · ${N} samples`, Math.max(x0 + 2, Math.min(lx, W - 210)), top0 + 10, 'left', '#b3b3b3');
      if (N > M && cur.ola < .5) label(narrow ? 'synthesis window' : 'synthesis window · 128 samples', tx(-M) - 6, ty(.5), 'right', '#9a9a9a');

      const sp = cur.spec;
      if (sp < .99) {
        ctx.globalAlpha = 1 - sp; ctx.fillStyle = '#b3b3b3'; ctx.textAlign = 'left';
        ctx.font = `12px ${MONO}`;
        const lines = narrow
          ? ['1  audio arrives; the window fills', '2  process the window after it fills', '3  the synthesis window sets the wait']
          : ['1  the window is the stretch of samples the model is allowed to look at', '2  it can only be processed once it is full: that wait is the latency', '3  the bright part of the tape is what the model sees right now'];
        lines.forEach((s, k) => ctx.fillText(s, x0 + 2, bot0 + 8 + k * 20));
        ctx.font = `11px ${MONO}`; ctx.globalAlpha = 1;
      }
      if (sp > .01) {
        ctx.globalAlpha = sp;
        const fx = scale(0, FMAX, x0, W - pad), fy = scale(-48, 0, bot0 + botH, bot0);
        ctx.fillStyle = '#7b7b7b'; ctx.textAlign = 'left'; ctx.fillText(narrow ? 'spectrum · relative level (dB)' : 'windowed signal → spectrum · relative level (dB)', x0 + 2, bot0 - 12);
        for (const f of [0, 400, 800, 1200, 1600]) {
          ctx.strokeStyle = '#1d1d1d'; ctx.beginPath(); ctx.moveTo(fx(f) + .5, bot0 - 6); ctx.lineTo(fx(f) + .5, bot0 + botH); ctx.stroke();
          ctx.fillStyle = '#6a6a6a'; ctx.textAlign = f === 0 ? 'left' : f === 1600 ? 'right' : 'center'; ctx.fillText(f === 1600 ? '1.6 kHz' : f ? String(f) : '0 Hz', fx(f) + (f === 1600 ? 4 : 0), bot0 + botH + 24);
        }
        ctx.fillStyle = '#6a6a6a'; ctx.textAlign = 'right'; ctx.fillText(narrow ? 'Hz →' : 'frequency →', W - pad, bot0 - 12);
        const db = spectrum(N, M);
        ctx.beginPath();
        db.forEach((v, j) => { const px = fx(j / (NF - 1) * FMAX), py = fy(v); j ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
        ctx.lineTo(fx(FMAX), fy(-48)); ctx.lineTo(fx(0), fy(-48)); ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fill();
        ctx.beginPath();
        db.forEach((v, j) => { const px = fx(j / (NF - 1) * FMAX), py = fy(v); j ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
        const bin = FS / N;
        if (FMAX / bin < 90) {
          ctx.fillStyle = '#fff';
          for (let f = 0; f <= FMAX; f += bin) { const j = Math.round(f / FMAX * (NF - 1)); ctx.beginPath(); ctx.arc(fx(f), fy(db[j]), 2.2, 0, 6.283); ctx.fill(); }
          const k = Math.max(1, Math.round(1250 / bin)), xa = fx(k * bin), xb = fx((k + 1) * bin), yb = bot0 + 8;
          if (xb < W - 60) {
            ctx.strokeStyle = '#9a9a9a'; ctx.beginPath(); ctx.moveTo(xa, yb + 5); ctx.lineTo(xa, yb); ctx.lineTo(xb, yb); ctx.lineTo(xb, yb + 5); ctx.stroke();
            label(`${bin.toFixed(0)} Hz between bins`, Math.max(x0 + 2, W - 158), yb + 4, 'left', '#b3b3b3');
          }
        }
        const tick = (list, color, y) => { ctx.fillStyle = color; for (const p of list) ctx.fillRect(fx(p.f) - 1, y, 2, 7); };
        tick(VOICE, '#fff', bot0 + botH + 4); tick(BAND, '#6f6f6f', bot0 + botH + 4);
        ctx.globalAlpha = 1;
      }
    }
    const loop = t => {
      raf = 0; if (!visible) return;
      const dt = lastT ? Math.min(.05, (t - lastT) / 1000) : 0; lastT = t;
      tape += dt * FS / 36; draw();
      if (!X.reduce) raf = requestAnimationFrame(loop);
    };
    function text() {
      const N = even(cur.N), M = even(Math.min(cur.M, N));
      legendItems.forEach(n => { n.hidden = cur.spec < .5; });
      readout.innerHTML = `<span><b>${(M / FS * 1000).toFixed(1)} ms</b>wait</span><span><b>${N}</b>samples analyzed</span><span><b>${(FS / N).toFixed(0)} Hz</b>between bins</span>`;
    }
    return {
      init(stage) {
        canvas = stage.querySelector('canvas'); ctx = canvas.getContext('2d'); readout = stage.querySelector('.readout'); legendItems = [...stage.querySelectorAll('.legend-strip span')].slice(4);
        observe(canvas.parentElement, (w, h) => { W = w; H = h; dpr = Math.min(2, devicePixelRatio || 1); canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); draw(); });
        new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible && !raf) { lastT = 0; raf = requestAnimationFrame(loop); } }).observe(canvas);
        if (document.fonts) document.fonts.ready.then(draw);
        text();
      },
      update(i, p) {
        const a = S[Math.max(0, i - 1)], b = S[i], t = i === 0 ? 1 : hop(i, p, .55);
        cur = { N: glerp(a.N, b.N, t), M: glerp(a.M, b.M, t), span: glerp(a.span, b.span, t), ola: lerp(a.ola, b.ola, t), mark: lerp(a.mark, b.mark, t), spec: lerp(a.spec, b.spec, t) };
        text(); if (X.reduce || !raf) draw();
      },
    };
  })());

  function pipeline(data) {
    const stages = [
      ['input', '64 samples / block', 'add to past buffer'],
      ['analysis STFT', '2048 past samples', '1025 bins'],
      ['encoder + GRU', 'pool to 64 bands', 'past context only'],
      ['mask head', 'gain 0–1 per bin', 'mixture × mask'],
      ['inverse STFT', '128-sample window', 'add overlaps every 64'],
      ['output', '64 samples / block', 'shifted by 1 hop'],
    ];
    const lit = [[0], [1], [2], [3], [4, 5], []];
    let svg, big, W = 0, H = 0, boxes = [], packet, pts = [], raf = 0, visible = false, step = 0, built = false, flow, cost;
    const loop = t => {
      raf = 0; if (!visible || !built) return;
      const f = X.reduce ? .45 : (t / 5200) % 1, seg = f * (pts.length - 1), k = Math.min(pts.length - 2, Math.floor(seg)), u = seg - k;
      packet.setAttribute('transform', `translate(${lerp(pts[k][0], pts[k + 1][0], u)},${lerp(pts[k][1], pts[k + 1][1], u)})`);
      if (!X.reduce && step < 5) raf = requestAnimationFrame(loop);
    };
    function build() {
      clear(svg); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const narrow = W < 520, cols = narrow ? 2 : 3, rows = 6 / cols, gap = narrow ? 22 : 32;
      const bw = (W - 8 - gap * (cols - 1)) / cols, bh = narrow ? 64 : 96, gy = narrow ? 18 : 40;
      const totalH = rows * bh + (rows - 1) * gy, top = Math.max(4, (H - totalH - 22) / 2);
      flow = el('g', {}, svg); cost = el('g', { opacity: 0 }, svg); boxes = []; pts = [];
      const defs = el('defs', {}, svg), mk = el('marker', { id: 'arr', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' }, defs);
      el('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#777' }, mk);
      stages.forEach((lines, i) => {
        const r = Math.floor(i / cols), c = r % 2 === 0 ? i % cols : cols - 1 - i % cols;
        const x = 4 + c * (bw + gap), y = top + r * (bh + gy), g = el('g', {}, flow);
        const rect = el('rect', { x, y, width: bw, height: bh, rx: 3, fill: '#121212', stroke: '#555' }, g);
        txt(g, x + 9, y + (narrow ? 16 : 24), `${i + 1} ${lines[0]}`, { class: 't-hi' });
        lines.slice(1).forEach((line, k) => txt(g, x + 9, y + (narrow ? 34 : 48) + k * 16, line, { class: 't-soft' }));
        boxes.push({ g, rect, x, y, cx: x + bw / 2, cy: y + bh / 2 });
      });
      boxes.forEach((b, i) => {
        if (i === 0) pts.push([b.x, b.cy]);
        pts.push([b.cx, b.cy]);
        const n = boxes[i + 1];
        if (!n) { pts.push([b.x + bw, b.cy]); return; }
        if (n.cy === b.cy) {
          const forward = n.x > b.x;
          el('line', { x1: forward ? b.x + bw : b.x, x2: forward ? n.x : n.x + bw, y1: b.cy, y2: n.cy, stroke: '#777', 'marker-end': 'url(#arr)' }, flow);
        } else {
          const ym = b.y + bh + gy / 2;
          el('path', { d: `M${b.cx},${b.y + bh} V${ym} H${n.cx} V${n.y}`, fill: 'none', stroke: '#777', 'marker-end': 'url(#arr)' }, flow);
          pts.push([b.cx, ym], [n.cx, ym]);
        }
      });
      txt(flow, 4, top + totalH + 18, narrow ? '□ block · lit box = stage' : '□ one block of 64 samples · bright box = the stage described at left', { class: 't-muted' });
      const left = 8, right = W - 12, maxBar = right - left, rowH = Math.min(108, H / 2 - 20), topCost = Math.max(30, (H - 2 * rowH) / 2);
      [['B · short · 129 bins', 1.55, '#8a8a8a'], ['C · dual · 1025 bins', 5.84, '#fff']].forEach(([label, value, color], k) => {
        const y = topCost + k * rowH;
        txt(cost, left, y, label, { class: 't-soft' });
        txt(cost, right, y, `${value.toFixed(2)} MMAC`, { class: 't-hi t-num', 'text-anchor': 'end' });
        el('rect', { x: left, y: y + 14, width: maxBar * value / 6, height: 24, fill: color }, cost);
      });
      txt(cost, left, topCost + rowH * 2, narrow ? 'MMAC per frame · 5.8 ms latency' : 'Compute per frame at the same 5.8 ms latency; per-bin layers dominate the cost.', { class: 't-muted' });
      packet = el('g', {}, flow); el('rect', { x: -4, y: -4, width: 8, height: 8, fill: '#fff', rx: 1 }, packet);
      built = true; paint(); if (visible && !raf) raf = requestAnimationFrame(loop);
    }
    function paint() {
      if (!built) return;
      boxes.forEach((b, i) => { const on = lit[step].includes(i); b.g.setAttribute('opacity', on ? 1 : .7); b.rect.setAttribute('stroke', on ? '#fff' : '#555'); });
      fade(flow, step === 5 ? 0 : 1); fade(cost, step === 5 ? 1 : 0);
    }
    return {
      init(stage) {
        svg = stage.querySelector('svg'); big = stage.querySelector('.big');
        observe(svg.parentElement, (w, h) => { W = w; H = h; build(); });
        new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible && !raf) raf = requestAnimationFrame(loop); }).observe(svg);
      },
      update(i) {
        step = i; paint();
        big.innerHTML = [
          '<div><b>64 samples</b>per block · 1.45 ms per hop</div>',
          '<div><b>2048 → 1025</b>past samples → frequency bins</div><div><b>128 samples</b>synthesis window</div>',
          '<div><b>0.94 M</b>parameters per model</div><div><b>64 bands</b>into one causal GRU layer</div>',
          '<div><b>0 … 1</b>one gain per bin</div><div><b>mixture × mask</b>the vocal estimate</div>',
          '<div><b>1 hop</b>streaming signal shift</div><div><b>127 samples</b>worst case with block wait</div>',
          '<div><b>5.84 / 1.55</b>MMAC per frame · C / B</div><div><b>1025 / 129</b>frequency bins</div>',
        ][i];
        if (visible && !raf) raf = requestAnimationFrame(loop);
      },
    };
  }

  function oracle(data) {
    const V = data.oracle.validation, O = data.octaves;
    let svg, big, W = 0, H = 0, gO, gB, dual = [], dualLbl, brk, inset, built = false, cur = { i: 0, p: 0 };
    function build() {
      clear(svg); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const narrow = W < 520;
      gO = el('g', {}, svg); gB = el('g', { opacity: 0 }, svg);
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
      const bx0 = narrow ? 44 : 56, bx1 = W - 16, btop = 30, bbot = H - 44;
      const order = ['A', 'B', 'C', 'E', 'D'], lat = { A: '23.2 ms', B: '5.8 ms', C: '5.8 ms', E: '2.9 ms', D: '2.9 ms' }, kind = { A: 'long', B: 'short', C: 'dual', E: 'short', D: 'dual' };
      const gw = (bx1 - bx0) / order.length, by = scale(0, -4, btop, bbot);
      const axb = el('g', { class: 'ax' }, gB);
      [0, -1, -2, -3, -4].forEach(v => { el('line', { x1: bx0 - 4, x2: bx1, y1: by(v), y2: by(v), stroke: v === 0 ? '#555' : '#1f1f1f' }, axb); txt(axb, bx0 - 8, by(v), `${v} dB`, { 'text-anchor': 'end', dy: '.35em' }); });
      txt(gB, bx0, 10, narrow ? '↓ vocal loss (dB), simulated bleed' : '↓ vocal energy lost with simulated bleed, by octave', { class: 't-muted' });
      order.forEach((k, i) => {
        const cx = bx0 + gw * (i + .5), w = Math.min(26, gw * .22);
        [[0, '#fff'], [1, '#6a6a6a']].forEach(([j, col]) => {
          const v = O.loss[k][j], xx = cx + (j ? 4 : -w - 4);
          el('rect', { x: xx, y: by(0), width: w, height: by(v) - by(0), fill: col }, gB);
          txt(gB, xx + w / 2, by(v) + 14, Math.abs(v).toFixed(1), { class: j ? 't-muted t-num' : 't-hi t-num', 'text-anchor': 'middle' });
        });
        txt(gB, cx, bbot + 16, narrow ? k : `${k} · ${kind[k]}`, { class: kind[k] === 'dual' ? 't-hi' : 't-soft', 'text-anchor': 'middle' });
        txt(gB, cx, bbot + 30, lat[k], { class: 't-muted', 'text-anchor': 'middle' });
      });
      const lg = el('g', {}, gB), lx = bx1 - (narrow ? 120 : 160), ly = 38;
      [['125–250 Hz', '#fff'], ['250–500 Hz', '#6a6a6a']].forEach(([l, col], k) => { el('rect', { x: lx, y: ly + k * 18 - 9, width: 12, height: 12, fill: col }, lg); txt(lg, lx + 18, ly + k * 18, l, { class: 't-soft', dy: '.35em' }); });
      built = true; render();
    }
    function render() {
      if (!built) return;
      const { i, p } = cur, t = hop(i, p, .5);
      const showDual = i === 1 ? t : i > 1 ? 1 : 0;
      dual.forEach(g => fade(g, showDual)); fade(dualLbl, showDual);
      fade(brk, i === 1 ? t : i > 1 ? 1 : 0);
      fade(inset, i === 2 ? 1 : 0);
      const sw = i === 3 ? t : 0;
      fade(gO, i === 2 ? 1 : 1 - sw); fade(gB, sw);
      [...gO.children].forEach(g => { if (g !== inset) g.style.visibility = i === 2 ? 'hidden' : ''; });
      const heads = [
        `<div><b>10.9 → 7.8 dB</b>ideal masks, symmetric 23.2 → 2.9 ms</div>`,
        `<div><b>10.06 dB</b>dual 2048 / 256 at 5.8 ms</div><div><b>9.52 dB</b>symmetric at 11.6 ms</div>`,
        `<div><b>+1.87 dB</b>oracle gain, positive on every song</div><div><b>+0.76 dB</b>trained · ≈ 40%</div>`,
        `<div><b>3.6 dB</b>lost at 125–250 Hz, short 256</div><div><b>2.6 dB</b>dual window</div><div><b>2.4 dB</b>long window</div>`,
      ];
      big.innerHTML = heads[i];
    }
    return { init(stage) { svg = stage.querySelector('svg'); big = stage.querySelector('.big'); observe(svg.parentElement, (w, h) => { W = w; H = h; build(); }); }, update(i, p) { cur = { i, p }; render(); } };
  }

  function gains(data) {
    const P = data.paired, keys = ['C-B', 'D-E', 'D-Ew', 'D-Ew'];
    const cfg = k => data.configs.find(c => c.key === k);
    const meta = [
      { lat: '5.8 ms', a: cfg('B').si_sdr_median, b: cfg('C').si_sdr_median, what: 'short → dual window, median song' },
      { lat: '2.9 ms', a: cfg('E').si_sdr_median, b: cfg('D').si_sdr_median, what: 'short → dual window, median song' },
      { lat: '2.9 ms', a: data.wide.Ew, b: cfg('D').si_sdr_median, what: 'wider short → dual, same compute' },
      { lat: '2.9 ms', a: data.wide.Ew, b: cfg('D').si_sdr_median, what: 'wider short → dual, same compute' },
    ];
    const n = data.tracks.length, hd = data.tracks.indexOf('PR - Happy Daze'), CAP = data.capacity;
    const ranks = keys.map(k => { const v = P[k].values, order = v.map((val, j) => [val, j]).sort((a, b) => a[0] - b[0]), r = new Array(n); order.forEach(([, j], q) => { r[j] = q; }); return r; });
    const clipv = v => Math.max(-3, Math.min(3, v));
    let svg, big, W = 0, H = 0, left, right, step, bw, y, bars = [], medLine, medText, meanLine, meanText, hdLabel, hdLead, gBars, gCap, cur = { i: 0, p: 0 }, built = false;
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
      gCap = el('g', { opacity: 0 }, svg);
      const cl = narrow ? 44 : 60, cr = W - 20, ct = 30, cb = H - 60, cx = k => cl + (cr - cl) * (k + .5) / 3, cy = scale(0, 1, cb, ct);
      const axc = el('g', { class: 'ax' }, gCap);
      [0, .25, .5, .75, 1].forEach(v => { el('line', { x1: cl - 4, x2: cr, y1: cy(v), y2: cy(v), stroke: v ? '#1e1e1e' : '#5a5a5a' }, axc); txt(axc, cl - 8, cy(v), v ? fmt(v) : '0', { 'text-anchor': 'end', dy: '.35em' }); });
      txt(gCap, cl, 12, narrow ? '↑ gain (dB) · 5.8 ms · 95% CI' : '↑ dual − short, median gain per song (dB) at 5.8 ms, with 95% CI', { class: 't-muted' });
      CAP.forEach((c, k) => {
        el('line', { x1: cx(k), x2: cx(k), y1: cy(c.ci[0]), y2: cy(c.ci[1]), stroke: '#9a9a9a', 'stroke-width': 2, 'stroke-linecap': 'round' }, gCap);
        el('circle', { cx: cx(k), cy: cy(c.gain), r: 6, fill: '#fff' }, gCap);
        txt(gCap, cx(k), cy(c.gain) - 14, `${fmt(c.gain)} dB`, { class: 't-hi t-num', 'text-anchor': 'middle' });
        txt(gCap, cx(k), cb + 18, narrow ? `${c.params_M} M` : `${c.params_M} M parameters`, { class: 't-soft', 'text-anchor': 'middle' });
        txt(gCap, cx(k), cb + 34, W < 850 ? `GRU ${c.width}` : `GRU width ${c.width} · short ${c.B.toFixed(2)} → dual ${c.C.toFixed(2)} dB`, { class: 't-muted', 'text-anchor': 'middle' });
      });
      if (W >= 850) txt(gCap, cr, ct + 15, narrow ? '0.17 M dual beats 0.94 M short: +0.31 dB' : 'the 0.17 M dual-window model beats the 0.94 M short-window model by 0.31 dB per song', { class: 't-soft', 'text-anchor': 'end' });
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
      const sw = i === 4 ? t : 0;
      fade(gBars, 1 - sw); fade(gCap, sw);
      if (i === 4) big.innerHTML = `<div><b>${fmt(CAP[0].gain)} / ${fmt(CAP[1].gain)} / ${fmt(CAP[2].gain)} dB</b>gain at 0.17 / 0.38 / 0.94 M</div><div><b>+0.31 dB</b>0.17 M dual over 0.94 M short</div>`;
      else { const m = meta[i], pb = P[keys[i]]; big.innerHTML = `<div><b>${m.lat}</b>latency</div><div><b>${m.a.toFixed(2)} → ${m.b.toFixed(2)}</b>${m.what}</div><div><b>${pb.better} of ${pb.n}</b>songs improve</div>`; }
    }
    return { init(stage) { svg = stage.querySelector('svg'); big = stage.querySelector('.big'); observe(svg.parentElement, (w, h) => { W = w; H = h; build(); }); }, update(i, p) { cur = { i, p }; render(); } };
  }

  function prefix(data) {
    const LC = data.latency_check;
    let svg, big, W = 0, H = 0, gSig, gTab, outs, brk, m2, built = false, cur = { i: 0, p: 0 };
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
      gSig = el('g', {}, svg); gTab = el('g', { opacity: 0 }, svg);
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
      const tl = narrow ? 4 : 60, th = Math.min(34, (H - 60) / 6), t0y = Math.max(26, (H - th * 7) / 2);
      const cols = narrow ? [tl, W * .27, W * .62, W * .82] : [tl, W * .35, W * .65, W * .84];
      txt(gTab, cols[0], t0y, 'config', { class: 't-muted' }); txt(gTab, cols[1], t0y, narrow ? 'windows' : 'analysis / synthesis', { class: 't-muted' }); txt(gTab, cols[2], t0y, narrow ? 'look' : 'look-ahead', { class: 't-muted' }); txt(gTab, cols[3], t0y, 'bound', { class: 't-muted' });
      el('line', { x1: tl, x2: Math.min(W - 16, cols[3] + 80), y1: t0y + 10, y2: t0y + 10, stroke: '#333' }, gTab);
      [['A', 'long', '23.2 ms'], ['B', 'short', '5.8 ms'], ['C', 'dual', '5.8 ms'], ['E', 'short', '2.9 ms'], ['D', 'dual', '2.9 ms']].forEach(([k, kind, lat], r) => {
        const c = data.configs.find(q => q.key === k), yy = t0y + th * (r + 1), hi = kind === 'dual';
        txt(gTab, cols[0], yy, narrow ? `${k} · ${kind}` : `${k} · ${kind} · ${lat}`, { class: hi ? 't-hi' : 't-soft' });
        txt(gTab, cols[1], yy, `${c.N} / ${c.M}`, { class: 't-soft t-num' });
        txt(gTab, cols[2], yy, `${LC[k].look}${narrow ? '' : ' samples'}`, { class: hi ? 't-hi t-num' : 't-soft t-num' });
        txt(gTab, cols[3], yy, `≤ ${LC[k].bound}`, { class: 't-muted t-num' });
      });
      txt(gTab, tl, t0y + th * 6 + 10, W < 850 ? 'Identity mask: 1-hop signal shift' : 'Identity-mask impulse: one-hop signal shift; with block wait, worst case M − 1 samples', { class: 't-muted' });
      built = true; render();
    }
    function render() {
      if (!built) return;
      const { i, p } = cur, t = hop(i, p, .5);
      fade(outs, i === 1 ? t : i > 1 ? 1 : 0); fade(m2, i === 1 ? clamp((t - .3) / .7) : i > 1 ? 1 : 0); fade(brk, i === 1 ? clamp((t - .5) / .5) : i > 1 ? 1 : 0);
      const sw = i === 2 ? t : 0; fade(gSig, 1 - sw); fade(gTab, sw);
      const heads = [`<div><b>n</b>the first sample that differs</div>`, `<div><b>123</b>samples look-ahead, 2.9 ms models</div><div><b>≤ 127</b>bound</div><div><b>247 ≤ 255</b>at 5.8 ms</div>`, `<div><b>1 hop</b>streaming delay of the code</div><div><b>2.88 ms</b>worst case at 2.9 ms</div>`];
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
    let svg, big, W = 0, H = 0, x, head, groups = [], gRace, gTrade, hopNote = [], hopHint, raf = 0, visible = false, t0 = performance.now(), step = 0, built = false;
    const loop = t => {
      raf = 0; if (!visible || !built) return;
      const play = X.reduce ? SPAN : ((t - t0) / 2600 % 1) * SPAN;
      head.setAttribute('x1', x(play)); head.setAttribute('x2', x(play));
      groups.forEach(g => g.bars.forEach((b, k) => {
        const s = k * hopMs, w = Math.max(0, Math.min(g.row.ms, play - s));
        b.setAttribute('width', Math.max(0, x(s + w) - x(s)));
        if (b.over) b.over.setAttribute('opacity', g.row.ms > hopMs && play - s > hopMs ? 1 : 0);
      }));
      hopNote.forEach((n, k) => n.setAttribute('opacity', step === 0 && play >= k * hopMs ? 1 : 0));
      if (!X.reduce) raf = requestAnimationFrame(loop);
    };
    function build() {
      clear(svg); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const narrow = W < 520;
      gRace = el('g', {}, svg); gTrade = el('g', { opacity: 0 }, svg);
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
      hopNote = [];
      for (let k = 0; k < 6; k++) {
        el('rect', { x: x(k * hopMs) + 1, y: top + 10, width: x(hopMs) - x(0) - 2, height: barH, fill: 'none', stroke: '#2e2e2e' }, gRace);
        hopNote.push(txt(gRace, x(k * hopMs + hopMs / 2), top + 10 + barH / 2, narrow ? `block ${k + 1}` : `block ${k + 1} arrives`, { class: 't-soft', 'text-anchor': 'middle', dy: '.35em', opacity: 0 }));
      }
      hopHint = txt(gRace, x(0), top + 10 + barH + 20, narrow ? '64 new samples every 1.45 ms' : 'every 1.45 ms a new block of 64 samples arrives; the previous one must be finished by then', { class: 't-muted' });
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
      const tl = narrow ? 54 : 60, tr = W - 20, tt = 24, tb = H - 88;
      const tx = scale(0, 6.5, tl, tr), ty = scale(2.8, 5, tb, tt);
      const axt = el('g', { class: 'ax' }, gTrade);
      [0, 1, 2, 3, 4, 5, 6].forEach(v => { el('line', { x1: tx(v), x2: tx(v), y1: tt, y2: tb, stroke: '#1f1f1f' }, axt); txt(axt, tx(v), tb + 16, String(v), { 'text-anchor': 'middle' }); });
      [3, 3.5, 4, 4.5, 5].forEach(v => { el('line', { x1: tl - 4, x2: tr, y1: ty(v), y2: ty(v), stroke: '#1f1f1f' }, axt); txt(axt, tl - 8, ty(v), narrow ? v.toFixed(1) : `${v.toFixed(1)} dB`, { 'text-anchor': 'end', dy: '.35em' }); });
      txt(gTrade, tr, tb + 32, 'million multiply-adds per frame →', { class: 't-muted', 'text-anchor': 'end' });
      txt(gTrade, tl, 10, narrow ? '↑ vocal SI-SDR (dB), median' : '↑ vocal SI-SDR, median over the 50 test songs', { class: 't-muted' });
      const pt = {}; data.configs.forEach(c => { pt[c.key] = [tx(c.mmac), ty(c.si_sdr_median)]; });
      [['B', 'C', data.paired['C-B'].median], ['E', 'D', data.paired['D-E'].median]].forEach(([a, b, g]) => {
        el('line', { x1: pt[a][0], x2: pt[b][0], y1: pt[a][1], y2: pt[b][1], stroke: '#555', 'stroke-dasharray': '4 3' }, gTrade);
        txt(gTrade, tl, H - (a === 'B' ? 24 : 6), `${b} − ${a}: ${fmt(g)} dB per song at ${a === 'B' ? '5.8' : '2.9'} ms`, { class: 't-soft t-num' });
      });
      data.configs.forEach(c => {
        const dual = c.kind === 'dual', [px, py] = pt[c.key];
        el('circle', { cx: px, cy: py, r: 6, fill: dual ? '#fff' : c.kind === 'long' ? '#0b0b0b' : '#8a8a8a', stroke: '#fff', 'stroke-width': dual || c.kind === 'long' ? 1.5 : 0 }, gTrade);
        txt(gTrade, dual ? px - 12 : px + 10, py + (c.key === 'E' ? 20 : c.key === 'B' ? -14 : c.key === 'C' ? -6 : c.key === 'D' ? 10 : 4), narrow ? `${c.key} ${c.latency_ms.toFixed(1)} ms` : `${c.key} · ${c.kind} · ${c.latency_ms.toFixed(1)} ms`, { class: dual ? 't-hi' : 't-soft', 'text-anchor': dual ? 'end' : 'start' });
      });
      built = true; paint();
      if (visible && !raf) raf = requestAnimationFrame(loop);
    }
    function paint() {
      if (!built) return;
      groups.forEach((g, r) => g.g.setAttribute('opacity', step >= 1 && r <= step - 1 ? 1 : 0));
      head.setAttribute('y2', head.top + head.rowH * Math.max(1, step) - 34);
      hopHint.setAttribute('opacity', step === 0 ? 1 : 0);
      fade(gRace, step === 4 ? 0 : 1); fade(gTrade, step === 4 ? 1 : 0);
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
          [`<div><b>64</b>samples per block</div>`, `<div><b>${hopMs.toFixed(2)} ms</b>per hop, the deadline</div>`],
          [`<div><b>${D.p99_ms.toFixed(2)} ms</b>99th percentile per hop</div>`, `<div><b>${hopMs.toFixed(2)} ms</b>budget per hop</div>`, `<div><b>${D.late_pct.toFixed(2)}%</b>late hops</div>`],
          [`<div><b>${D.rtf.toFixed(3)}</b>real-time factor, dual</div>`, `<div><b>${E.rtf.toFixed(3)}</b>real-time factor, short</div>`],
          [`<div><b>${data.torch_D.rtf.toFixed(2)}</b>real-time factor, eager PyTorch</div>`, `<div><b>${data.torch_D.late_pct.toFixed(0)}%</b>late hops</div>`],
          [`<div><b>3.8× / 4.7×</b>multiply-adds of the short window</div>`, `<div><b>≈ 2×</b>measured CPU time</div>`, `<div><b>0.31 dB</b>cost of 23.2 → 5.8 ms with the dual window</div>`],
        ];
        big.innerHTML = cells[i].join('');
        if (X.reduce) loop(performance.now());
      },
    };
  }

  function bleed(data) {
    const B = data.bleed;
    let svg, big, W = 0, H = 0, gA, gC, gP, built = false, cur = { i: 0, p: 0 };
    function build() {
      clear(svg); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const narrow = W < 520;
      gA = el('g', {}, svg); gC = el('g', { opacity: 0 }, svg); gP = el('g', { opacity: 0 }, svg);
      const l0 = narrow ? 48 : 90, r0 = W - 65, mid = Math.max(60, H * .22), lx = scale(-30, 0, l0, Math.min(r0, l0 + 360));
      txt(gA, l0, mid - 42, narrow ? 'the simulated microphone' : 'the simulated vocal microphone: levels at the input', { class: 't-muted' });
      [['voice', 0, '#fff'], ['band', -5, '#6a6a6a']].forEach(([n, v, col], k) => {
        const y = mid + k * 34;
        txt(gA, l0 - 10, y + 12, n, { class: 't-soft', 'text-anchor': 'end' });
        el('rect', { x: l0, y, width: lx(v) - l0, height: 16, fill: col }, gA);
        txt(gA, lx(v) + 8, y + 12, v ? `${v} dB` : '0 dB', { class: 't-hi t-num' });
      });
      const y2 = mid + 88;
      txt(gA, l0, y2, narrow ? 'hold the mixture’s mask fixed:' : 'estimate a mask from the mixture, then hold it fixed:', { class: 't-soft' });
      txt(gA, l0, y2 + 20, narrow ? 'output = voice kept + bleed left' : 'output = voice kept + accompaniment remaining', { class: 't-soft' });
      [['kept voice', 'vocal loss (dB, 0 = nothing lost)'], ['remaining band', 'bleed attenuation (dB, more = cleaner)']].forEach(([a, b], k) => {
        const y = y2 + 56 + k * 30;
        el('rect', { x: l0, y: y - 10, width: 10, height: 10, fill: k ? '#6a6a6a' : '#fff' }, gA);
        txt(gA, l0 + 18, y - 1, narrow ? (k ? 'band left → bleed attenuation' : 'voice kept → vocal loss') : `${a}  →  measured as ${b}`, { class: 't-muted' });
      });
      if (!narrow) txt(gA, l0, y2 + 126, narrow ? 'stronger mask → less of both' : 'Stronger masks remove more of both; compare at equal attenuation.', { class: 't-muted' });
      const cl = narrow ? 38 : 60, cr = W - 26, ct = 48, cb = H - 50;
      const x = scale(7, 14.5, cl, cr), y = scale(-1.4, 0, cb, ct);
      const ax = el('g', { class: 'ax' }, gC);
      [7, 9, 11, 13].forEach(v => { el('line', { x1: x(v), x2: x(v), y1: ct, y2: cb, stroke: '#1f1f1f' }, ax); txt(ax, x(v), cb + 16, `${v} dB`, { 'text-anchor': 'middle' }); });
      [0, -.4, -.8, -1.2].forEach(v => { el('line', { x1: cl - 4, x2: cr, y1: y(v), y2: y(v), stroke: v ? '#1f1f1f' : '#555' }, ax); txt(ax, cl - 8, y(v), v ? v.toFixed(1) : '0', { 'text-anchor': 'end', dy: '.35em' }); });
      txt(gC, cr, cb + 32, 'band removed (bleed attenuation) →', { class: 't-muted', 'text-anchor': 'end' });
      txt(gC, cl, 10, '↓ voice lost (dB)', { class: 't-muted' });
      const style = { A: ['#9a9a9a', '3 3', 1.3], B: ['#8a8a8a', '', 1.6], C: ['#fff', '', 1.6], E: ['#8a8a8a', '', 1.6], D: ['#fff', '', 2] };
      const name = { A: 'A long 23.2', B: 'B short 5.8', C: 'C dual 5.8', E: 'E short 2.9', D: 'D dual 2.9' };
      Object.entries(B.curves).forEach(([k, pts]) => {
        const [col, dash, sw] = style[k];
        el('path', { d: pts.map(([a, b], j) => `${j ? 'L' : 'M'}${x(a).toFixed(1)},${y(b).toFixed(1)}`).join(' '), fill: 'none', stroke: col, 'stroke-width': sw, 'stroke-dasharray': dash }, gC);
        const last = pts[pts.length - 1];
        txt(gC, x(last[0]) + 6, y(last[1]) + (k === 'B' ? 16 : k === 'C' ? -6 : 4), W < 850 ? k : name[k], { class: k === 'C' || k === 'D' ? 't-hi' : 't-muted' });
      });
      const eq = B.equal.DE, ex = x(eq.atten);
      el('line', { x1: ex, x2: ex, y1: ct, y2: cb, stroke: '#fff', 'stroke-dasharray': '2 4' }, gC);
      ['D', 'E'].forEach(k => el('circle', { cx: ex, cy: y(eq.loss[k]), r: 5, fill: k === 'D' ? '#fff' : '#8a8a8a' }, gC));
      el('path', { d: `M${ex + 12},${y(eq.loss.D)} H${ex + 18} V${y(eq.loss.E)} H${ex + 12}`, fill: 'none', stroke: '#fff' }, gC);
      txt(gC, cr, 30, narrow ? 'at 8.9 dB: D loses 0.67, E 0.97 dB' : 'At equal 8.9 dB bleed attenuation: D loses 0.67 dB of voice, E loses 0.97 dB', { class: 't-hi halo', 'text-anchor': 'end' });
      const pl = narrow ? 48 : 70, pr = W - 16, pt = 30, pb = H - 80, py = scale(0, 1.2, pb, pt), n = B.paths.length;
      const axp = el('g', { class: 'ax' }, gP);
      [0, .3, .6, .9, 1.2].forEach(v => { el('line', { x1: pl - 4, x2: pr, y1: py(v), y2: py(v), stroke: v ? '#1f1f1f' : '#555' }, axp); txt(axp, pl - 8, py(v), v ? fmt(v) : '0', { 'text-anchor': 'end', dy: '.35em' }); });
      txt(gP, pl, 10, narrow ? '↑ paired gain (dB) · 95% CI' : '↑ dual − short, median SI-SDR gain per song (dB) with 95% CI', { class: 't-muted' });
      const gw = (pr - pl) / n, bw = Math.min(30, gw * .2);
      B.paths.forEach((pth, i) => {
        const cx = pl + gw * (i + .5);
        [['CB', 'C − B · 5.8 ms', '#8a8a8a', -1], ['DE', 'D − E · 2.9 ms', '#fff', 1]].forEach(([k, l, col, s]) => {
          const [m, lo, hi] = pth[k], xx = cx + s * (bw / 2 + 3) - bw / 2;
          el('rect', { x: xx, y: py(m), width: bw, height: py(0) - py(m), fill: col }, gP);
          el('line', { x1: xx + bw / 2, x2: xx + bw / 2, y1: py(lo), y2: py(hi), stroke: '#0b0b0b', 'stroke-width': 3 }, gP);
          el('line', { x1: xx + bw / 2, x2: xx + bw / 2, y1: py(lo), y2: py(hi), stroke: s > 0 ? '#9a9a9a' : '#ccc', 'stroke-width': 1.5 }, gP);
          txt(gP, xx + bw / 2, py(m) - 10, fmt(m), { class: s > 0 ? 't-hi t-num halo' : 't-soft t-num halo', 'text-anchor': 'middle' });
          if (i === 0) { const ly = pb + (s < 0 ? 46 : 64); el('rect', { x: pl, y: ly - 9, width: 12, height: 10, fill: col }, gP); txt(gP, pl + 20, ly, l, { class: s > 0 ? 't-hi' : 't-soft' }); }
        });
        txt(gP, cx, pb + 18, narrow ? ['dry', 'filter + delay', 'room FIR'][i] : pth.label, { class: 't-soft', 'text-anchor': 'middle' });
      });
      built = true; render();
    }
    function render() {
      if (!built) return;
      const { i, p } = cur, t = hop(i, p, .5);
      fade(gA, i === 0 ? 1 : i === 1 ? 1 - t : 0); fade(gC, i === 1 ? t : i === 2 ? 1 - t : 0); fade(gP, i === 2 ? t : 0);
      const heads = [`<div><b>−5 dB</b>band below the voice</div><div><b>fixed mask</b>kept voice + remaining band</div>`,
        `<div><b>0.67 vs 0.97 dB</b>voice lost, D vs E at 8.9 dB attenuation</div><div><b>0.68 vs 0.94 dB</b>C vs B at 9.7 dB</div>`,
        `<div><b>+0.59 … +0.91 dB</b>paired gain on three paths</div><div><b>+0.32 … +0.35 dB</b>more voice kept at equal attenuation, D over E</div>`];
      big.innerHTML = heads[i];
    }
    return { init(stage) { svg = stage.querySelector('svg'); big = stage.querySelector('.big'); observe(svg.parentElement, (w, h) => { W = w; H = h; build(); }); }, update(i, p) { cur = { i, p }; render(); } };
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

  async function scanHero(hero) {
    const canvas = hero.querySelector('canvas'), title = hero.querySelector('h1');
    if (!canvas || !title || !canvas.getContext) return;
    try { await Promise.all([document.fonts.load('500 80px "Instrument Sans"'), document.fonts.load('400 12px "JetBrains Mono"')]); } catch (e) {}
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, dpr = 1, cols = [], cy = 0, th = 0, raf = 0, visible = true, mx = -1e4, start = performance.now();
    const layout = () => {
      dpr = Math.min(2, devicePixelRatio || 1);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      const hb = hero.getBoundingClientRect(), tb = title.getBoundingClientRect(), cs = getComputedStyle(title);
      const off = document.createElement('canvas'); off.width = Math.ceil(W); off.height = Math.ceil(H);
      const o = off.getContext('2d');
      o.fillStyle = '#fff'; o.textAlign = 'center'; o.textBaseline = 'middle';
      o.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      o.letterSpacing = cs.letterSpacing;
      cy = tb.top - hb.top + tb.height / 2; th = tb.height;
      o.fillText(title.innerText.trim(), W / 2, cy);
      const img = o.getImageData(0, 0, off.width, off.height).data;
      cols = [];
      const y0 = Math.max(0, Math.floor(cy - th)), y1 = Math.min(off.height, Math.ceil(cy + th));
      for (let x = 0; x < off.width; x += 2) {
        const runs = []; let s = -1;
        for (let y = y0; y <= y1; y++) {
          const on = y < y1 && img[(y * off.width + x) * 4 + 3] > 110;
          if (on && s < 0) s = y; else if (!on && s >= 0) { runs.push([s, y]); s = -1; }
        }
        if (runs.length) cols.push({ x, runs });
      }
      hero.classList.add('particles-on');
    };
    const draw = t => {
      raf = 0; if (!visible) return;
      const time = (t - start) / 1000, hp = clamp(scrollY / (hero.offsetHeight * .8));
      const rv = X.reduce ? 1 : ease(clamp(time / 1.9));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const tl = cols.length ? cols[0].x - 28 : W / 2, tr = cols.length ? cols[cols.length - 1].x + 30 : W / 2;
      ctx.strokeStyle = '#222'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, cy + .5); ctx.lineTo(tl, cy + .5); ctx.moveTo(tr, cy + .5); ctx.lineTo(W, cy + .5); ctx.stroke();
      ctx.beginPath();
      for (let x = (W / 2) % 48; x < W; x += 48) { if (x > tl && x < tr) continue; ctx.moveTo(x + .5, cy - 4); ctx.lineTo(x + .5, cy + 4); }
      ctx.stroke();
      const beam = rv * (W + 80) - 40;
      const sweep = rv >= 1 && !X.reduce ? ((time - 1.9) % 7 / 7) * (W + 120) - 60 : -1e4;
      const stretch = 1 + hp * 1.8;
      for (const c of cols) {
        if (c.x > beam) break;
        const trail = clamp((beam - c.x) / 90), near = Math.max(0, 1 - Math.abs(c.x - mx) / 70);
        const re = Math.max(0, 1 - Math.abs(c.x - sweep) / 60);
        const x = W / 2 + (c.x - W / 2) * stretch;
        const jit = X.reduce ? 0 : Math.sin(time * 3 + c.x * .05) * .35;
        const a = clamp((.9 + .1 * (1 - trail) + near * .1 + re * .1) * (1 - hp * .92));
        ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
        const grow = 1 + near * .1 + re * .04;
        for (const r of c.runs) { const m = (r[0] + r[1]) / 2, h = (r[1] - r[0]) * grow; ctx.fillRect(x - .9, m - h / 2 + jit, 1.8, h); }
      }
      if (rv < 1) {
        const g = ctx.createLinearGradient(beam - 70, 0, beam, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,.32)');
        ctx.fillStyle = g; ctx.fillRect(beam - 70, cy - th * .7, 70, th * 1.4);
        ctx.fillStyle = '#fff'; ctx.fillRect(beam, cy - th * .7, 1, th * 1.4);
      }
      if (!X.reduce) raf = requestAnimationFrame(draw);
    };
    const go = () => { if (!raf) raf = requestAnimationFrame(draw); };
    layout(); go();
    let rt = 0;
    addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { layout(); go(); }, 150); });
    hero.addEventListener('pointermove', e => { const b = canvas.getBoundingClientRect(); mx = e.clientX - b.left; go(); });
    hero.addEventListener('pointerleave', () => { mx = -1e4; });
    new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) go(); }).observe(hero);
    addEventListener('scroll', () => { if (X.reduce && visible) go(); }, { passive: true });
  }

  fetch('data.json').then(r => r.json()).then(data => {
    X.scene('pipeline', pipeline(data));
    X.scene('oracle', oracle(data));
    X.scene('gains', gains(data));
    X.scene('prefix', prefix(data));
    X.scene('deadline', deadline(data));
    X.scene('bleed', bleed(data));
  }).catch(e => console.error(e)).then(() => { budget(); X.boot({ hero: scanHero }); });
})();
