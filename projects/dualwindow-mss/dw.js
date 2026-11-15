(() => {
  const X = window.Explainer, { el, scale, clamp, lerp, ease } = X;
  const FS = 44100;
  const MONO = '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';
  const fmt = (v, d = 2) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d);
  const hop = (i, p, f = .5) => ease(clamp(p / f));
  const glerp = (a, b, t) => Math.exp(lerp(Math.log(a), Math.log(b), t));
  const observe = (node, fn) => { const ro = new ResizeObserver(() => fn(node.clientWidth, node.clientHeight)); ro.observe(node); return ro; };
  const clear = n => { while (n.firstChild) n.removeChild(n.firstChild); };

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
  const PARTIALS = VOICE.concat(BAND), FMAX = 1650, NF = 330, AMP = 3.4;
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
      { N: 1024, M: 1024, span: 2304, ola: 0, mark: 0 },
      { N: 256, M: 256, span: 2304, ola: 0, mark: 0 },
      { N: 128, M: 128, span: 2304, ola: 0, mark: 0 },
      { N: 2048, M: 128, span: 2304, ola: 0, mark: 0 },
      { N: 2048, M: 128, span: 420, ola: 1, mark: 0 },
      { N: 2048, M: 128, span: 2304, ola: 0, mark: 1 },
    ];
    let canvas, ctx, readout, W = 0, H = 0, dpr = 1, cur = S[0], raf = 0, visible = false, tape = 0, lastT = 0;
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
      const top0 = 16, topH = H * .34, base = top0 + topH, amp = topH * .3;
      const by = base + amp + 18, bot0 = by + 64, botH = Math.max(40, H - bot0 - 26);
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
      curve(wa, 0, true); ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fill();
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
        ctx.fillStyle = '#d0d0d0'; ctx.textAlign = 'left'; ctx.fillText('sum = 1', tx(-3 * M) + 2, ty(.98) - 7);
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(tx(0) + .5, top0 - 8); ctx.lineTo(tx(0) + .5, base + amp + 6); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.fillText('now', tx(0) - 6, top0 - 1);
      const bx0 = tx(-M), bx1 = tx(0);
      ctx.strokeStyle = cur.mark > .5 ? '#fff' : '#9a9a9a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bx0, by - 5); ctx.lineTo(bx0, by); ctx.lineTo(bx1, by); ctx.lineTo(bx1, by - 5); ctx.stroke();
      label(`wait ${M} samples = ${(M / FS * 1000).toFixed(1)} ms`, bx1, by + 16, 'right', cur.mark > .5 ? '#fff' : '#b3b3b3');
      if (cur.mark > .01) {
        ctx.globalAlpha = cur.mark; ctx.fillStyle = '#fff';
        ctx.fillText(narrow ? 'look-ahead 123 ≤ 127 samples' : 'measured look-ahead: 123 samples (bound 127)', bx1, by + 32); ctx.globalAlpha = 1;
      }
      ctx.textAlign = 'left'; ctx.fillStyle = '#b3b3b3';
      const lx = Math.max(x0 + 2, tx(-N) + 4);
      if (cur.ola < .5) ctx.fillText(N > M ? `analysis window · ${N} samples` : `window · ${N} samples`, Math.min(lx, W - 200), top0 + 10);
      if (N > M && cur.ola < .5) label('synthesis window', tx(-M) - 6, ty(.5), 'right', '#9a9a9a');
      label(narrow ? 'tape: dim = arriving, bright = under the window' : 'the tape runs in slow motion · dim: samples arriving · bright: what the model sees', x0 + 2, base + amp + 12, 'left', '#6a6a6a');

      const fx = scale(0, FMAX, x0, W - pad), fy = scale(-48, 0, bot0 + botH, bot0);
      ctx.fillStyle = '#7b7b7b'; ctx.textAlign = 'left'; ctx.fillText(narrow ? 'spectrum (illustration)' : 'what the separator sees: spectrum of the windowed mixture (illustration)', x0 + 2, bot0 - 12);
      for (const f of [0, 400, 800, 1200, 1600]) {
        ctx.strokeStyle = '#1d1d1d'; ctx.beginPath(); ctx.moveTo(fx(f) + .5, bot0 - 6); ctx.lineTo(fx(f) + .5, bot0 + botH); ctx.stroke();
        ctx.fillStyle = '#6a6a6a'; ctx.textAlign = f === 0 ? 'left' : f === 1600 ? 'right' : 'center'; ctx.fillText(f === 1600 ? '1.6 kHz' : f ? String(f) : '0 Hz', fx(f) + (f === 1600 ? 4 : 0), bot0 + botH + 24);
      }
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
      }
      const tick = (list, color, y) => { ctx.fillStyle = color; for (const p of list) ctx.fillRect(fx(p.f) - 1, y, 2, 7); };
      tick(VOICE, '#fff', bot0 + botH + 4); tick(BAND, '#6f6f6f', bot0 + botH + 4);
    }
    const loop = t => {
      raf = 0; if (!visible) return;
      const dt = lastT ? Math.min(.05, (t - lastT) / 1000) : 0; lastT = t;
      tape += dt * FS / 36; draw();
      if (!X.reduce) raf = requestAnimationFrame(loop);
    };
    function text() {
      const N = even(cur.N), M = even(Math.min(cur.M, N));
      readout.innerHTML = `<span><b>${(M / FS * 1000).toFixed(1)} ms</b>wait</span><span><b>${N}</b>samples analyzed</span><span><b>${(FS / N).toFixed(0)} Hz</b>between bins</span>`;
    }
    return {
      init(stage) {
        canvas = stage.querySelector('canvas'); ctx = canvas.getContext('2d'); readout = stage.querySelector('.readout');
        observe(canvas.parentElement, (w, h) => { W = w; H = h; dpr = Math.min(2, devicePixelRatio || 1); canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); draw(); });
        new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible && !raf) { lastT = 0; raf = requestAnimationFrame(loop); } }).observe(canvas);
        if (document.fonts) document.fonts.ready.then(draw);
        text();
      },
      update(i, p) {
        const a = S[Math.max(0, i - 1)], b = S[i], t = i === 0 ? 1 : hop(i, p, .55);
        cur = { N: glerp(a.N, b.N, t), M: glerp(a.M, b.M, t), span: glerp(a.span, b.span, t), ola: lerp(a.ola, b.ola, t), mark: lerp(a.mark, b.mark, t) };
        text(); if (X.reduce || !raf) draw();
      },
    };
  })());

  function gains(data) {
    const P = data.paired, keys = ['C-B', 'D-E', 'D-Ew', 'D-Ew'];
    const cfg = k => data.configs.find(c => c.key === k);
    const meta = [
      { lat: '5.8 ms', a: cfg('B').si_sdr_median, b: cfg('C').si_sdr_median, what: 'short → dual window, median song' },
      { lat: '2.9 ms', a: cfg('E').si_sdr_median, b: cfg('D').si_sdr_median, what: 'short → dual window, median song' },
      { lat: '2.9 ms', a: data.wide.Ew, b: cfg('D').si_sdr_median, what: 'wider short → dual, same compute' },
      { lat: '2.9 ms', a: data.wide.Ew, b: cfg('D').si_sdr_median, what: 'wider short → dual, same compute' },
    ];
    const n = data.tracks.length, hd = data.tracks.indexOf('PR - Happy Daze');
    const ranks = keys.map(k => { const v = P[k].values, order = v.map((val, j) => [val, j]).sort((a, b) => a[0] - b[0]), r = new Array(n); order.forEach(([, j], q) => { r[j] = q; }); return r; });
    const clipv = v => Math.max(-3, Math.min(3, v));
    let svg, big, W = 0, H = 0, left, right, step, bw, y, bars = [], medLine, medText, meanLine, meanText, hdLabel, hdLead, cur = { i: 0, p: 0 }, built = false;
    function build() {
      clear(svg); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const narrow = W < 520;
      left = narrow ? 30 : 56; right = W - 12; step = (right - left) / n; bw = Math.max(2, Math.min(12, step * .6));
      y = scale(-3, 3, H - 30, 16);
      const ax = el('g', { class: 'ax' }, svg);
      for (let t = -3; t <= 3; t++) {
        el('line', { x1: left - 6, x2: right, y1: y(t), y2: y(t), stroke: t === 0 ? '#5a5a5a' : '#1e1e1e' }, ax);
        el('text', { x: left - 10, y: y(t), dy: '.35em', 'text-anchor': 'end' }, ax).textContent = t === 0 ? '0' : t === 3 ? '+3 dB' : fmt(t, 0);
      }
      el('text', { x: right, y: H - 8, 'text-anchor': 'end', class: 't-muted' }, svg).textContent = narrow ? 'test songs, sorted by gain →' : 'one bar per MUSDB18-HQ test song, sorted by the gain of the dual window →';
      const g = el('g', {}, svg);
      bars = Array.from({ length: n }, (_, j) => { const r = el('rect', { width: bw.toFixed(1), rx: 1 }, g); r.titleEl = el('title', {}, r); r.titleEl.textContent = data.tracks[j]; return r; });
      meanLine = el('line', { x1: left, x2: right, stroke: '#9a9a9a', 'stroke-dasharray': '2 4', opacity: 0 }, svg);
      meanText = el('text', { x: right, class: 't-soft t-num halo', 'text-anchor': 'end', opacity: 0 }, svg);
      medLine = el('line', { x1: left, x2: right, stroke: '#fff', 'stroke-dasharray': '4 3' }, svg);
      medText = el('text', { x: left + 4, class: 't-hi t-num halo', 'text-anchor': 'start' }, svg);
      hdLead = el('path', { fill: 'none', stroke: '#9a9a9a', opacity: 0 }, svg);
      hdLabel = el('text', { class: 't-hi halo', opacity: 0 }, svg);
      built = true;
    }
    function render() {
      if (!built) return;
      const { i, p } = cur, t = hop(i, p, .45), ia = Math.max(0, i - 1);
      const va = P[keys[ia]].values, vb = P[keys[i]].values, ra = ranks[ia], rb = ranks[i], y0 = y(0);
      bars.forEach((b, j) => {
        const rank = i === 0 ? rb[j] : lerp(ra[j], rb[j], t);
        const v = i === 0 ? lerp(0, clipv(vb[j]), t) : lerp(clipv(va[j]), clipv(vb[j]), t);
        const x = left + rank * step + (step - bw) / 2, y1 = y(v), hi = i === 3 && j === hd;
        b.setAttribute('x', x.toFixed(1)); b.setAttribute('y', Math.min(y0, y1).toFixed(1)); b.setAttribute('height', Math.max(.6, Math.abs(y1 - y0)).toFixed(1));
        b.setAttribute('fill', hi ? '#fff' : v >= 0 ? '#e6e6e6' : '#5a5a5a');
        b.setAttribute('opacity', i === 3 && !hi ? .3 : 1);
        if (t > .99) b.titleEl.textContent = `${data.tracks[j]}: ${fmt(vb[j])} dB`;
      });
      const med = lerp(i === 0 ? 0 : P[keys[ia]].median, P[keys[i]].median, t);
      medLine.setAttribute('y1', y(med)); medLine.setAttribute('y2', y(med));
      medText.setAttribute('y', y(med) - 6); medText.textContent = `median ${fmt(med)} dB`;
      const sm = i === 3 ? t : 0, mean = P[keys[i]].mean;
      meanLine.setAttribute('y1', y(mean)); meanLine.setAttribute('y2', y(mean)); meanLine.setAttribute('opacity', sm);
      meanText.setAttribute('y', y(mean) + 15); meanText.setAttribute('opacity', sm); meanText.textContent = `mean ${fmt(mean)} dB`;
      const hx = left + rb[hd] * step + step / 2, ly = y(-2.1);
      hdLead.setAttribute('d', `M${hx.toFixed(1)},${y(-3)} L${(hx + 12).toFixed(1)},${ly + 4} L${(hx + 18).toFixed(1)},${ly + 4}`); hdLead.setAttribute('opacity', sm);
      hdLabel.setAttribute('x', hx + 22); hdLabel.setAttribute('y', ly + 8); hdLabel.setAttribute('opacity', sm);
      hdLabel.textContent = `PR – Happy Daze: ${fmt(vb[hd], 0)} dB, clipped`;
      const m = meta[i], pb = P[keys[i]];
      big.innerHTML = `<div><b>${m.lat}</b>latency</div><div><b>${m.a.toFixed(2)} → ${m.b.toFixed(2)}</b>${m.what}</div><div><b>${pb.better} of ${pb.n}</b>songs improve</div>`;
    }
    return {
      init(stage) { svg = stage.querySelector('svg'); big = stage.querySelector('.big'); observe(svg.parentElement, (w, h) => { W = w; H = h; build(); render(); }); },
      update(i, p) { cur = { i, p }; render(); },
    };
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
      const play = ((t - t0) / 2600 % 1) * SPAN;
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
      x = scale(0, SPAN, 4, W - 4);
      const defs = el('defs', {}, svg), pat = el('pattern', { id: 'hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
      el('rect', { width: 6, height: 6, fill: '#0b0b0b' }, pat); el('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: '#fff', 'stroke-width': 2 }, pat);
      const rowH = Math.min(124, Math.max(68, (H - 80) / 3)), barH = Math.min(46, rowH - 50), top = Math.max(50, (H - rowH * 3) / 2 + 30);
      head = el('line', { y1: top - 24, y2: top + rowH * (step + 1) - 34, stroke: '#fff', 'stroke-width': 1.2, opacity: .55 }, svg);
      head.rowH = rowH; head.top = top;
      const ax = el('g', { class: 'ax' }, svg);
      for (let k = 0; k <= 6; k++) {
        el('line', { x1: x(k * hopMs), x2: x(k * hopMs), y1: top - 20, y2: top - 14, stroke: '#444' }, ax);
        if (!narrow || k % 2 === 0) el('text', { x: x(k * hopMs), y: top - 26, 'text-anchor': k === 0 ? 'start' : k === 6 ? 'end' : 'middle' }, ax).textContent = `${(k * hopMs).toFixed(2)} ms`;
      }
      el('text', { x: x(0), y: top - 44, class: 't-muted' }, svg).textContent = narrow ? 'slot = one 1.45 ms hop · bar = compute time' : 'each slot is one 1.45 ms hop; the bar is the time spent computing it, in slow motion';
      groups = [];
      rows.forEach((row, r) => {
        const gy = top + r * rowH, g = el('g', { opacity: r <= step ? 1 : 0, style: 'transition: opacity .5s' }, svg);
        el('text', { x: x(0), y: gy, class: 't-soft halo' }, g).textContent = narrow ? row.label.replace('2.9 ms ', '').replace(' · ONNX Runtime', '') : row.label;
        el('text', { x: x(SPAN), y: gy, class: 't-hi t-num halo', 'text-anchor': 'end' }, g).textContent = narrow && row.short ? row.short : (narrow ? row.note.replace(' per hop', '') : row.note);
        const bars = [];
        for (let k = 0; k < 6; k++) {
          el('rect', { x: x(k * hopMs) + 1, y: gy + 10, width: x(hopMs) - x(0) - 2, height: barH, fill: 'none', stroke: '#2e2e2e' }, g);
          const b = el('rect', { x: x(k * hopMs) + 1, y: gy + 10, height: barH, width: 0, fill: row.ms > hopMs ? 'url(#hatch)' : '#fff' }, g);
          if (row.ms > hopMs) { b.over = el('text', { x: x((k + 1) * hopMs) - 4, y: gy + 10 + barH + 14, 'text-anchor': 'end', class: 't-muted', opacity: 0 }, g); b.over.textContent = 'late'; }
          bars.push(b);
        }
        groups.push({ g, bars, row });
      });
      built = true;
      if (visible && !raf) raf = requestAnimationFrame(loop);
    }
    return {
      init(stage) {
        svg = stage.querySelector('svg'); big = stage.querySelector('.big');
        observe(svg.parentElement, (w, h) => { W = w; H = h; build(); });
        new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible && !raf) raf = requestAnimationFrame(loop); }).observe(svg);
      },
      update(i) {
        step = i;
        if (head) head.setAttribute('y2', head.top + head.rowH * (i + 1) - 34);
        groups.forEach((g, r) => g.g.setAttribute('opacity', r <= i ? 1 : 0));
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
        const lab = d <= -1 ? `${10 ** d} ms`.replace('0.01', '0.01').replace('0.1', '0.1') : d <= 2 ? `${10 ** d} ms` : `${10 ** (d - 3)} s`;
        if (!narrow || d % 2 === 0) el('text', { x: x(d), y: ay + 22, 'text-anchor': d === -2 ? 'start' : d === 4 ? 'end' : 'middle' }, svg).textContent = lab;
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
        const t1 = el('text', { x: ax0 + dx, y: m.up ? ty - 6 : ty - 2, 'text-anchor': m.anchor, class: m.hi ? 'hi' : 'soft' }, g); t1.textContent = narrow && m.n1 ? m.n1 : m.l1;
        const l2 = narrow && m.n2 !== undefined ? m.n2 : m.l2;
        if (l2) el('text', { x: ax0 + dx, y: m.up ? ty + 8 : ty + 12, 'text-anchor': m.anchor }, g).textContent = l2;
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
    X.scene('gains', gains(data));
    X.scene('deadline', deadline(data));
  }).catch(e => console.error(e)).then(() => { budget(); X.boot({ hero: scanHero }); });
})();
