(() => {
  const X = window.Explainer, { el, scale, clamp, lerp, ease } = X;
  const FS = 44100;
  const fmt = (v, d = 2) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d);
  const hop = (i, p, f = .5) => ease(clamp(p / f));

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
  const PARTIALS = VOICE.concat(BAND), FMAX = 1650, NF = 330;
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
    let canvas, ctx, ro, W = 0, H = 0, dpr = 1, cur = S[0];
    const even = v => Math.max(2, Math.round(v / 2) * 2);
    const glerp = (a, b, t) => Math.exp(lerp(Math.log(a), Math.log(b), t));
    function draw() {
      if (!W) return;
      const N = even(cur.N), M = even(Math.min(cur.M, N));
      const { wa, ws } = windows(N, M);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      ctx.font = '12px "Instrument Sans", system-ui, sans-serif';
      const pad = 8, top0 = 22, topH = H * .36, bot0 = topH + 96, botH = H - bot0 - 36, narrow = W < 520;
      const span = cur.span, tx = scale(-span, 0, pad, W - pad), ty = scale(0, 1.15, top0 + topH, top0);
      ctx.strokeStyle = '#2c2c2c'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad, ty(0) + .5); ctx.lineTo(W - pad, ty(0) + .5); ctx.stroke();
      const curve = (arr, start, close) => {
        ctx.beginPath(); let first = true;
        for (let n = start; n < arr.length; n++) {
          const t = n - arr.length; if (t < -span) continue;
          const px = tx(t), py = ty(arr[n]);
          if (first) { ctx.moveTo(px, close ? ty(0) : py); if (close) ctx.lineTo(px, py); first = false; } else ctx.lineTo(px, py);
        }
        if (close) { ctx.lineTo(tx(0), ty(0)); ctx.closePath(); }
      };
      curve(wa, 0, true); ctx.fillStyle = 'rgba(255,255,255,.09)'; ctx.fill();
      curve(wa, 0, false); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.stroke();
      if (N > M) { curve(ws, N - M, false); ctx.setLineDash([4, 3]); ctx.strokeStyle = '#9a9a9a'; ctx.lineWidth = 1.4; ctx.stroke(); ctx.setLineDash([]); }
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
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(tx(0) - .5, top0 - 6); ctx.lineTo(tx(0) - .5, ty(0) + 6); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.fillText('now', tx(0) - 6, top0 - 2);
      const by = ty(0) + 20, bx0 = tx(-M), bx1 = tx(0) - 1;
      ctx.strokeStyle = cur.mark > .5 ? '#fff' : '#9a9a9a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bx0, by - 5); ctx.lineTo(bx0, by); ctx.lineTo(bx1, by); ctx.lineTo(bx1, by - 5); ctx.stroke();
      ctx.fillStyle = cur.mark > .5 ? '#fff' : '#b3b3b3'; ctx.textAlign = 'right';
      ctx.fillText(`waits ${M} samples = ${(M / FS * 1000).toFixed(1)} ms`, bx1, by + 16);
      if (cur.mark > .01) {
        ctx.globalAlpha = cur.mark; ctx.textAlign = 'right'; ctx.fillStyle = '#fff';
        ctx.fillText(narrow ? 'look-ahead 123 ≤ 127 samples' : 'measured look-ahead: 123 samples (bound 127)', bx1, by + 32); ctx.globalAlpha = 1;
      }
      ctx.textAlign = 'left'; ctx.fillStyle = '#b3b3b3';
      const lx = Math.max(pad, tx(-N) + 4);
      if (cur.ola < .5) ctx.fillText(N > M ? `analysis window, ${N} samples` : `window, ${N} samples`, Math.min(lx, W - 190), top0 + 10);
      if (N > M && cur.ola < .5) { ctx.fillStyle = '#9a9a9a'; ctx.textAlign = 'right'; ctx.fillText('synthesis window', tx(-M) - 6, ty(.5)); }

      const fx = scale(0, FMAX, pad, W - pad), fy = scale(-48, 0, bot0 + botH, bot0);
      ctx.fillStyle = '#7b7b7b'; ctx.textAlign = 'left'; ctx.fillText(narrow ? 'spectrum (illustration)' : 'what the separator sees: spectrum of a mixture (illustration)', pad, bot0 - 12);
      for (const f of [0, 400, 800, 1200, 1600]) {
        ctx.strokeStyle = '#1d1d1d'; ctx.beginPath(); ctx.moveTo(fx(f) + .5, bot0 - 6); ctx.lineTo(fx(f) + .5, bot0 + botH); ctx.stroke();
        ctx.fillStyle = '#6a6a6a'; ctx.textAlign = f === 0 ? 'left' : 'center'; ctx.fillText(f === 1600 ? '1.6 kHz' : f ? f : '0 Hz', fx(f), bot0 + botH + 30);
      }
      const db = spectrum(N, M);
      ctx.beginPath();
      db.forEach((v, j) => { const px = fx(j / (NF - 1) * FMAX), py = fy(v); j ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.lineTo(fx(FMAX), fy(-48)); ctx.lineTo(fx(0), fy(-48)); ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fill();
      ctx.beginPath();
      db.forEach((v, j) => { const px = fx(j / (NF - 1) * FMAX), py = fy(v); j ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.stroke();
      const bin = FS / N;
      if (FMAX / bin < 90) {
        ctx.fillStyle = '#fff';
        for (let f = 0; f <= FMAX; f += bin) { const j = Math.round(f / FMAX * (NF - 1)); ctx.beginPath(); ctx.arc(fx(f), fy(db[j]), 2.2, 0, 6.283); ctx.fill(); }
      }
      const tick = (list, color, y) => { ctx.fillStyle = color; for (const p of list) ctx.fillRect(fx(p.f) - 1, y, 2, 7); };
      tick(VOICE, '#fff', bot0 + botH + 6); tick(BAND, '#6f6f6f', bot0 + botH + 6);
    }
    function size() {
      const w = canvas.parentElement.clientWidth;
      W = w; H = Math.round(Math.min(w * .78, innerHeight * .62)); dpr = Math.min(2, devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.height = H + 'px';
      draw();
    }
    let readout;
    function text() {
      const N = even(cur.N), M = even(Math.min(cur.M, N));
      readout.innerHTML = `<span><b>${(M / FS * 1000).toFixed(1)} ms</b>wait</span><span><b>${N}</b>samples analyzed</span><span><b>${(FS / N).toFixed(0)} Hz</b>between bins</span>`;
    }
    return {
      init(stage) {
        canvas = stage.querySelector('canvas'); ctx = canvas.getContext('2d'); readout = stage.querySelector('.readout');
        ro = new ResizeObserver(size); ro.observe(canvas.parentElement);
        document.fonts && document.fonts.ready.then(size);
      },
      update(i, p) {
        const a = S[Math.max(0, i - 1)], b = S[i], t = i === 0 ? 1 : hop(i, p, .55);
        cur = { N: glerp(a.N, b.N, t), M: glerp(a.M, b.M, t), span: glerp(a.span, b.span, t), ola: lerp(a.ola, b.ola, t), mark: lerp(a.mark, b.mark, t) };
        text(); draw();
      },
    };
  })());

  function gains(data) {
    const P = data.paired, keys = ['C-B', 'D-E', 'D-Ew', 'D-Ew'];
    const meta = [
      { lat: '5.8 ms', short: data.configs.find(c => c.key === 'B'), dual: data.configs.find(c => c.key === 'C'), cmp: '256-sample window' },
      { lat: '2.9 ms', short: data.configs.find(c => c.key === 'E'), dual: data.configs.find(c => c.key === 'D'), cmp: '128-sample window' },
      { lat: '2.9 ms', cmp: 'wider 128-sample model, same compute' },
      { lat: '2.9 ms', cmp: 'wider 128-sample model, same compute' },
    ];
    const n = data.tracks.length, hd = data.tracks.indexOf('PR - Happy Daze');
    let svg, dots = [], medLine, medText, zeroLbl, big, hdLabel, hdLead, meanMark, meanText, VW = 640, VH = 430, x, y, states, intro;
    const state = k => {
      const v = P[keys[k]].values, order = v.map((val, j) => [val, j]).sort((a, b) => a[0] - b[0]), rank = new Array(n);
      order.forEach(([, j], r) => { rank[j] = r; });
      return v.map((val, j) => ({ x: x(Math.max(-3, Math.min(3, val))), y: y(rank[j]), pos: val > 0, clip: val < -3 }));
    };
    return {
      init(stage) {
        svg = stage.querySelector('svg'); big = stage.querySelector('.big');
        if (stage.clientWidth < 560) { VW = 400; VH = 360; }
        x = scale(-3, 3, 30, VW - 14); y = scale(0, n - 1, VH - 52, 30);
        states = keys.map((_, k) => state(k)); intro = states[0].map(s => ({ x: x(0), y: s.y, pos: s.pos, clip: false }));
        svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
        const ax = el('g', { class: 'ax' }, svg);
        for (let t = -3; t <= 3; t++) {
          el('line', { x1: x(t), x2: x(t), y1: 20, y2: VH - 40, stroke: t === 0 ? '#555' : '#1f1f1f' }, ax);
          el('text', { x: x(t), y: VH - 20, 'text-anchor': 'middle' }, ax).textContent = t === 0 ? '0' : (t > 0 ? '+' : '−') + Math.abs(t);
        }
        el('text', { x: x(3), y: VH - 4, 'text-anchor': 'end', class: 't-muted' }, svg).textContent = 'better →';
        zeroLbl = el('text', { x: x(-3), y: VH - 4, 'text-anchor': 'start', class: 't-muted' }, svg); zeroLbl.textContent = '← worse   gain in vocal SI-SDR (dB)';
        medLine = el('line', { y1: 18, y2: VH - 40, stroke: '#fff', 'stroke-dasharray': '3 3' }, svg);
        medText = el('text', { y: 12, class: 't-hi t-num', 'text-anchor': 'middle' }, svg);
        meanMark = el('path', { d: 'M-5,0 L5,0 L0,-8 Z', fill: 'none', stroke: '#fff', opacity: 0 }, svg);
        meanText = el('text', { y: VH - 46, class: 't-soft t-num', 'text-anchor': 'start', opacity: 0 }, svg);
        const g = el('g', {}, svg);
        dots = Array.from({ length: n }, () => el('circle', { r: 4.2 }, g));
        hdLead = el('path', { fill: 'none', stroke: '#9a9a9a', opacity: 0 }, svg);
        hdLabel = el('text', { class: 't-hi', opacity: 0 }, svg);
      },
      update(i, p) {
        const t = i === 0 ? hop(0, p, .45) : hop(i, p, .45);
        const A = i === 0 ? intro : states[i - 1], B = states[i];
        dots.forEach((d, j) => {
          const a = A[j], b = B[j], cx = lerp(a.x, b.x, t), cy = lerp(a.y, b.y, t), pos = t > .5 ? b.pos : a.pos;
          d.setAttribute('cx', cx.toFixed(1)); d.setAttribute('cy', cy.toFixed(1));
          const hi = i === 3 && j === hd;
          d.setAttribute('fill', pos ? '#fff' : '#5c5c5c'); d.setAttribute('r', hi ? 7 : 4.2);
          d.setAttribute('stroke', hi ? '#fff' : 'none'); d.setAttribute('stroke-width', hi ? 2 : 0);
          d.setAttribute('fill-opacity', i === 3 && j !== hd ? .35 : 1);
        });
        const pa = P[keys[Math.max(0, i - 1)]], pb = P[keys[i]], med = lerp(i === 0 ? 0 : pa.median, pb.median, t);
        medLine.setAttribute('x1', x(med)); medLine.setAttribute('x2', x(med));
        medText.setAttribute('x', x(med)); medText.textContent = `median ${fmt(med)} dB`;
        const showMean = i === 3 ? t : 0;
        meanMark.setAttribute('transform', `translate(${x(pb.mean)},${VH - 40})`); meanMark.setAttribute('opacity', showMean);
        meanText.setAttribute('x', x(pb.mean) + 10); meanText.setAttribute('opacity', showMean); meanText.textContent = `mean ${fmt(pb.mean)} dB`;
        const h = states[i][hd];
        const ly = y(14), lx = x(-3) + 6;
        hdLead.setAttribute('d', `M${h.x},${h.y - 8} L${h.x},${ly + 6} L${lx},${ly + 6}`); hdLead.setAttribute('opacity', i === 3 ? t : 0);
        hdLabel.setAttribute('x', lx); hdLabel.setAttribute('y', ly); hdLabel.setAttribute('opacity', i === 3 ? t : 0);
        hdLabel.textContent = `PR – Happy Daze: ${fmt(pb.values[hd], 0)} dB (off scale)`;
        const m = meta[i];
        const head = m.short ? `<div><b>${m.short.si_sdr_median.toFixed(2)} → ${m.dual.si_sdr_median.toFixed(2)} dB</b>short → dual window, median song</div>`
          : `<div><b>${data.wide.Ew.toFixed(2)} → ${data.configs.find(c => c.key === 'D').si_sdr_median.toFixed(2)} dB</b>wider short → dual window, same compute</div>`;
        big.innerHTML = `<div><b>${m.lat}</b>latency</div>${head}<div><b>${pb.better} of ${pb.n}</b>songs improve</div>`;
      },
    };
  }

  function deadline(data) {
    const D = data.configs.find(c => c.key === 'D'), E = data.configs.find(c => c.key === 'E');
    const hopMs = D.hop_ms, SPAN = hopMs * 6;
    let VW = 640, VH = 300, narrow = false;
    const rows = [
      { label: '2.9 ms dual window · ONNX Runtime', ms: D.rtf * hopMs, note: `${(D.rtf * hopMs).toFixed(2)} ms per hop`, step: 0 },
      { label: '2.9 ms short window · ONNX Runtime', ms: E.rtf * hopMs, note: `${(E.rtf * hopMs).toFixed(2)} ms per hop`, step: 1 },
      { label: '2.9 ms dual window · eager PyTorch', ms: data.torch_D.rtf * hopMs, note: `${(data.torch_D.rtf * hopMs).toFixed(2)} ms per hop · every hop late`, short: `${(data.torch_D.rtf * hopMs).toFixed(2)} ms · late`, step: 2 },
    ];
    let x;
    let svg, groups = [], head, big, raf = 0, visible = false, step = 0, t0 = performance.now();
    const loop = t => {
      raf = 0; if (!visible) return;
      const play = ((t - t0) / 2600 % 1) * SPAN;
      head.setAttribute('x1', x(play)); head.setAttribute('x2', x(play));
      groups.forEach(g => g.bars.forEach((b, k) => {
        const s = k * hopMs, w = Math.max(0, Math.min(g.row.ms, play - s));
        b.setAttribute('width', Math.max(0, x(s + w) - x(s)));
        if (b.over) b.over.setAttribute('opacity', g.row.ms > hopMs && play - s > hopMs ? 1 : 0);
      }));
      if (!X.reduce) raf = requestAnimationFrame(loop);
    };
    return {
      init(stage) {
        svg = stage.querySelector('svg'); big = stage.querySelector('.big');
        if (stage.clientWidth < 560) { VW = 400; VH = 300; narrow = true; }
        x = scale(0, SPAN, 4, VW - 4);
        svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
        const defs = el('defs', {}, svg), pat = el('pattern', { id: 'hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
        el('rect', { width: 6, height: 6, fill: '#0b0b0b' }, pat); el('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: '#fff', 'stroke-width': 2 }, pat);
        head = el('line', { y1: 24, y2: VH - 34, stroke: '#fff', 'stroke-width': 1.2, opacity: .55 }, svg);
        const ax = el('g', { class: 'ax' }, svg);
        for (let k = 0; k < 6; k++) el('text', { x: x(k * hopMs + hopMs / 2), y: VH - 14, 'text-anchor': 'middle' }, ax).textContent = narrow ? `${k + 1}` : `hop ${k + 1}`;
        el('text', { x: x(0), y: 14, class: 't-muted' }, svg).textContent = narrow ? 'slot = one 1.45 ms hop · bar = compute time' : 'each slot = one 1.45 ms hop; the bar = time spent computing it (slowed down)';
        rows.forEach((row, r) => {
          const gy = 40 + r * 80, g = el('g', { opacity: r === 0 ? 1 : 0, style: 'transition: opacity .5s' }, svg);
          el('text', { x: x(0), y: gy, class: 't-soft halo' }, g).textContent = narrow ? row.label.replace('2.9 ms ', '').replace(' · ONNX Runtime', '') : row.label;
          el('text', { x: x(SPAN), y: gy, class: 't-hi t-num halo', 'text-anchor': 'end' }, g).textContent = narrow && row.short ? row.short : (narrow ? row.note.replace(' per hop', '') : row.note);
          const bars = [];
          for (let k = 0; k < 6; k++) {
            el('rect', { x: x(k * hopMs) + 1, y: gy + 10, width: x(hopMs) - x(0) - 2, height: 26, fill: 'none', stroke: '#2e2e2e' }, g);
            const b = el('rect', { x: x(k * hopMs) + 1, y: gy + 10, height: 26, width: 0, fill: row.ms > hopMs ? 'url(#hatch)' : '#fff' }, g);
            if (row.ms > hopMs) { b.over = el('text', { x: x((k + 1) * hopMs) - 4, y: gy + 50, 'text-anchor': 'end', class: 't-muted', opacity: 0 }, g); b.over.textContent = 'late'; }
            bars.push(b);
          }
          groups.push({ g, bars, row });
        });
        new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible && !raf) raf = requestAnimationFrame(loop); }).observe(svg);
      },
      update(i) {
        step = i;
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

  fetch('data.json').then(r => r.json()).then(data => {
    X.scene('gains', gains(data));
    X.scene('deadline', deadline(data));
    X.boot({ mode: 'wave' });
  }).catch(e => { console.error(e); X.boot({ mode: 'wave' }); });
})();
