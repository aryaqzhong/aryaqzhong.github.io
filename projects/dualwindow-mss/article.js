(() => {
  const X = window.Explainer, { el, scale, clamp } = X;
  const FS = 44100;
  const fmt = (v, d = 2) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d);
  const clear = n => { while (n.firstChild) n.removeChild(n.firstChild); };
  const txt = (parent, x, y, s, attrs = {}) => { const t = el('text', Object.assign({ x, y }, attrs), parent); t.textContent = s; return t; };
  const observe = (node, fn) => { const ro = new ResizeObserver(() => fn(node.clientWidth, node.clientHeight)); ro.observe(node); return ro; };
  const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  const seg = (box, items, current, onPick) => {
    box.replaceChildren(...items.map(([id, label]) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.dataset.id = id;
      b.setAttribute('aria-pressed', String(id === current));
      b.addEventListener('click', () => onPick(id));
      return b;
    }));
    return id => box.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
  };

  function citations() {
    const pop = document.createElement('div'); pop.className = 'ref-pop'; pop.setAttribute('role', 'tooltip'); document.body.appendChild(pop);
    const show = a => {
      const li = document.querySelector(a.getAttribute('href')); if (!li) return;
      pop.innerHTML = ''; const b = document.createElement('b'); b.textContent = `Reference ${a.getAttribute('href').replace('#ref-', '')}`;
      const p = document.createElement('span'); p.textContent = li.textContent.trim();
      pop.append(b, p);
      const r = a.getBoundingClientRect(), w = Math.min(340, innerWidth - 32);
      pop.style.left = `${Math.max(16, Math.min(scrollX + r.left - 20, scrollX + innerWidth - w - 16))}px`;
      pop.style.top = `${scrollY + r.bottom + 8}px`;
      pop.classList.add('on');
    };
    const hide = () => pop.classList.remove('on');
    document.querySelectorAll('a.ref').forEach(a => {
      a.addEventListener('mouseenter', () => show(a)); a.addEventListener('mouseleave', hide);
      a.addEventListener('focus', () => show(a)); a.addEventListener('blur', hide);
    });
  }

  function windows(N, M) {
    const h = new Float64Array(M), wa = new Float64Array(N), ws = new Float64Array(N);
    for (let n = 0; n < M; n++) h[n] = .5 - .5 * Math.cos(2 * Math.PI * n / M);
    const L = N - M / 2;
    for (let n = 0; n < L; n++) wa[n] = Math.sqrt(.5 - .5 * Math.cos(Math.PI * n / L));
    for (let n = L; n < N; n++) wa[n] = Math.sqrt(h[n - L + M / 2]);
    for (let n = N - M; n < N; n++) { const v = h[n - N + M] / wa[n]; ws[n] = isFinite(v) ? v : 0; }
    return { wa, ws };
  }

  function windowLab(data) {
    const fig = document.getElementById('lab-window'); if (!fig) return;
    const NS = [128, 256, 512, 1024, 2048, 4096], MS = [128, 256, 512, 1024];
    const presets = [['A', 'A · 1024 / 1024', 1024, 1024], ['B', 'B · 256 / 256', 256, 256], ['C', 'C · 2048 / 256', 2048, 256], ['E', 'E · 128 / 128', 128, 128], ['D', 'D · 2048 / 128', 2048, 128]];
    const svg = fig.querySelector('svg'), read = fig.querySelector('[data-role="read"]');
    const rN = fig.querySelector('[data-role="N"]'), rM = fig.querySelector('[data-role="M"]');
    const oN = fig.querySelector('[data-out="N"]'), oM = fig.querySelector('[data-out="M"]');
    let N = 2048, M = 128, W = 0, H = 0;
    const cache = new Map();
    function spectrum() {
      const key = N + ':' + M; if (cache.has(key)) return cache.get(key);
      const { wa } = windows(N, M);
      const xs = Array.from(wa, (v, n) => v * (Math.cos(2 * Math.PI * 220 * n / FS) + .85 * Math.cos(2 * Math.PI * 330 * n / FS + .7)));
      const mag = f => {
        const a = -2 * Math.PI * f / FS, c = Math.cos(a), s = Math.sin(a);
        let zr = 1, zi = 0, re = 0, im = 0;
        for (const v of xs) { re += v * zr; im += v * zi; const t = zr * c - zi * s; zi = zr * s + zi * c; zr = t; }
        return Math.hypot(re, im);
      };
      const curve = Array.from({ length: 301 }, (_, j) => [j * 2, mag(j * 2)]), mx = Math.max(...curve.map(p => p[1]));
      const bins = Array.from({ length: Math.floor(600 * N / FS) + 1 }, (_, k) => { const f = k * FS / N; return [f, mag(f) / mx]; });
      const out = { curve: curve.map(([f, m]) => [f, m / mx]), bins };
      if (cache.size > 40) cache.clear(); cache.set(key, out); return out;
    }
    const pathOf = pts => pts.map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    function draw() {
      if (!W || !H) return;
      clear(svg); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const narrow = W < 560, l = narrow ? 8 : 12, r = W - 12;
      const T = Math.max(N, 1024) * 1.04, tx = scale(-T, 0, l, r);
      const top = 22, wH = H * .3, base = top + wH, ty = scale(0, 1.1, base, top);
      const { wa, ws } = windows(N, M);
      el('line', { x1: l, x2: r, y1: base, y2: base, stroke: '#333' }, svg);
      const area = [[tx(-N), base]]; for (let n = 0; n < N; n += Math.max(1, N >> 9)) area.push([tx(n - N), ty(wa[n])]); area.push([tx(0), ty(wa[N - 1])], [tx(0), base]);
      el('path', { d: pathOf(area) + 'Z', fill: 'rgba(255,255,255,.1)' }, svg);
      el('path', { d: pathOf(area.slice(1, -1)), fill: 'none', stroke: '#fff', 'stroke-width': 1.6 }, svg);
      if (N > M) {
        const syn = []; for (let n = N - M; n < N; n++) syn.push([tx(n - N), ty(ws[n])]);
        el('path', { d: pathOf(syn), fill: 'none', stroke: '#9a9a9a', 'stroke-width': 1.4, 'stroke-dasharray': '4 3' }, svg);
      }
      el('line', { x1: tx(0), x2: tx(0), y1: top - 10, y2: base + 30, stroke: '#fff' }, svg);
      txt(svg, tx(0) - 6, top - 2, 'now', { class: 't-hi', 'text-anchor': 'end' });
      const right = tx(-N) > W * .5; txt(svg, right ? tx(-N) - 10 : tx(-N) + 4, top + 10, `analysis window · ${N} samples`, { class: 't-soft', 'text-anchor': right ? 'end' : 'start' });
      if (N > M) txt(svg, tx(-M) - 8, ty(.55), narrow ? 'synthesis' : `synthesis · ${M}`, { class: 't-muted', 'text-anchor': 'end' });
      const by = base + 16;
      el('path', { d: `M${tx(-M)},${by - 5} V${by} H${tx(0) - 1} V${by - 5}`, fill: 'none', stroke: '#fff' }, svg);
      txt(svg, tx(0) - 1, by + 16, `wait ${M} samples ≈ ${(M / FS * 1000).toFixed(1)} ms`, { class: 't-hi', 'text-anchor': 'end' });
      txt(svg, l, by + 16, `${Math.round(T)} samples ago`, { class: 't-muted' });
      const s0 = base + 70, s1 = H - 26, fx = scale(0, 600, l + 22, r), fy = scale(0, 1, s1, s0 + 22);
      txt(svg, fx(220) - 6, s0 + 6, 'voice 220 Hz', { class: 't-hi', 'text-anchor': 'end' });
      txt(svg, fx(330) + 6, s0 + 6, 'band 330 Hz', { class: 't-soft' });
      el('line', { x1: fx(220), x2: fx(220), y1: s0 + 10, y2: s0 + 18, stroke: '#fff', 'stroke-width': 2 }, svg);
      el('line', { x1: fx(330), x2: fx(330), y1: s0 + 10, y2: s0 + 18, stroke: '#999', 'stroke-width': 2 }, svg);
      [0, .5, 1].forEach(v => el('line', { x1: fx(0), x2: r, y1: fy(v), y2: fy(v), stroke: v ? '#222' : '#555' }, svg));
      [0, 200, 400, 600].forEach(f => txt(svg, fx(f), s1 + 18, f === 600 ? '600 Hz' : String(f), { class: 't-muted', 'text-anchor': f === 0 ? 'start' : f === 600 ? 'end' : 'middle' }));
      const { curve, bins } = spectrum();
      el('path', { d: pathOf(curve.map(([f, v]) => [fx(f), fy(v)])), fill: 'none', stroke: '#b3b3b3', 'stroke-width': 1.6 }, svg);
      bins.forEach(([f, v]) => { el('line', { x1: fx(f), x2: fx(f), y1: s1, y2: fy(v), stroke: '#444' }, svg); el('circle', { cx: fx(f), cy: fy(v), r: 3.3, fill: '#fff', stroke: '#0b0b0b' }, svg); });
      txt(svg, l, s0 - 14, narrow ? 'what the model sees: the spectrum' : 'what the model sees: the spectrum of the two tones through the analysis window', { class: 't-muted' });
    }
    let mark = () => {};
    function sync() {
      if (M > N) M = N;
      rN.value = NS.indexOf(N); rM.value = MS.indexOf(M); oN.textContent = N; oM.textContent = M;
      const hit = presets.find(p => p[2] === N && p[3] === M); mark(hit ? hit[0] : '');
      const o = data.oracle.validation.find(v => v.N === N && v.M === M);
      const nb = Math.floor(600 * N / FS) + 1;
      read.innerHTML = `<span><b>${(M / FS * 1000).toFixed(1)} ms</b>algorithmic wait (≤ ${M - 1} samples)</span><span><b>${(FS / N).toFixed(0)} Hz</b>between bins</span><span><b>${nb}</b>bins below 600 Hz</span><span><b>${o ? o.sdr.toFixed(2) + ' dB' : 'not measured'}</b>ideal-mask uSDR, validation</span>${hit ? `<span><b>${hit[0]}</b>configuration in the study</span>` : ''}`;
      draw();
    }
    mark = seg(fig.querySelector('[data-role="preset"]'), presets.map(p => [p[0], p[1]]), 'D', id => { const p = presets.find(q => q[0] === id); N = p[2]; M = p[3]; sync(); });
    rN.addEventListener('input', () => { N = NS[+rN.value]; sync(); });
    rM.addEventListener('input', () => { M = MS[+rM.value]; if (M > N) N = M; sync(); });
    observe(svg.parentElement, (w, h) => { W = w; H = h; draw(); });
    sync();
  }

  function songLab(data) {
    const fig = document.getElementById('lab-songs'); if (!fig) return;
    const P = data.paired, tracks = data.tracks, hd = tracks.indexOf('PR - Happy Daze');
    const cmps = [['C-B', 'C − B · 5.8 ms'], ['D-E', 'D − E · 2.9 ms'], ['C-Bw', 'C − wider B'], ['D-Ew', 'D − wider E']];
    const svg = fig.querySelector('svg'), read = fig.querySelector('[data-role="read"]'), hover = fig.querySelector('[data-role="hover"]'), drop = fig.querySelector('[data-role="drop"]');
    let key = 'D-E', W = 0, H = 0, rows = [], geo = null, hot = -1;
    function stats() {
      const v = P[key].values.map((x, j) => ({ x, j })).filter(d => !(drop.checked && d.j === hd));
      const xs = v.map(d => d.x);
      return { v, med: median(xs), mu: mean(xs), better: xs.filter(x => x > 0).length, n: xs.length };
    }
    function draw() {
      if (!W || !H) return;
      clear(svg); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const narrow = W < 560, l = narrow ? 34 : 56, r = W - (narrow ? 12 : 110), y = scale(-3, 3, H - 26, 14);
      const s = stats(); rows = s.v.sort((a, b) => a.x - b.x);
      const step = (r - l) / rows.length, bw = Math.max(2, Math.min(12, step * .62));
      for (let t = -3; t <= 3; t++) { el('line', { x1: l - 6, x2: r, y1: y(t), y2: y(t), stroke: t ? '#1e1e1e' : '#5a5a5a' }, svg); txt(svg, l - 10, y(t), t ? (t === 3 && !narrow ? '+3 dB' : fmt(t, 0)) : '0', { class: 't-muted', 'text-anchor': 'end', dy: '.35em' }); }
      rows.forEach((d, k) => {
        const v = Math.max(-3, Math.min(3, d.x)), x = l + k * step + (step - bw) / 2, y0 = y(0), y1 = y(v);
        el('rect', { x, y: Math.min(y0, y1), width: bw, height: Math.max(.8, Math.abs(y1 - y0)), rx: 1, fill: k === hot ? '#fff' : d.x >= 0 ? '#d8d8d8' : '#5a5a5a', opacity: hot >= 0 && k !== hot ? .55 : 1 }, svg);
        if (d.x < -3) txt(svg, x + bw / 2, y(-3) + 14, '▼', { class: 't-muted', 'text-anchor': 'middle' });
      });
      el('line', { x1: l, x2: r, y1: y(s.med), y2: y(s.med), stroke: '#fff', 'stroke-dasharray': '4 3' }, svg);
      if (narrow) txt(svg, l + 4, y(s.med) - 6, `median ${fmt(s.med)} dB`, { class: 't-hi t-num halo' });
      el('line', { x1: l, x2: r, y1: y(s.mu), y2: y(s.mu), stroke: '#9a9a9a', 'stroke-dasharray': '2 4' }, svg);
      if (narrow) txt(svg, r, y(s.mu) + (s.mu < s.med ? 15 : -6), `mean ${fmt(s.mu)} dB`, { class: 't-soft t-num halo', 'text-anchor': 'end' });
      else { const dy = Math.abs(y(s.mu) - y(s.med)) < 14 ? (s.mu < s.med ? 8 : -8) : 0; txt(svg, r + 8, y(s.mu) + dy, `mean ${fmt(s.mu)}`, { class: 't-soft t-num', dy: '.35em' }); txt(svg, r + 8, y(s.med) - dy, `median ${fmt(s.med)}`, { class: 't-hi t-num', dy: '.35em' }); }
      geo = { l, step };
      read.innerHTML = `<span><b>${fmt(s.med)} dB</b>median per song</span><span><b>${fmt(s.mu)} dB</b>mean per song</span><span><b>${s.better} of ${s.n}</b>songs improve</span>`;
    }
    const pick = e => {
      if (!geo) return;
      const b = svg.getBoundingClientRect(), x = (e.clientX - b.left) * (W / b.width), k = Math.floor((x - geo.l) / geo.step);
      const k2 = k >= 0 && k < rows.length ? k : -1;
      if (k2 !== hot) { hot = k2; draw(); }
      hover.textContent = hot >= 0 ? `${tracks[rows[hot].j].replace(' - ', ' – ')}: ${fmt(rows[hot].x)} dB` : ' ';
    };
    svg.addEventListener('pointermove', pick); svg.addEventListener('pointerdown', pick);
    svg.addEventListener('pointerleave', () => { hot = -1; hover.textContent = ' '; draw(); });
    const markCmp = seg(fig.querySelector('[data-role="cmp"]'), cmps, key, id => { key = id; hot = -1; markCmp(id); draw(); });
    drop.addEventListener('change', () => { hot = -1; draw(); });
    observe(svg.parentElement, (w, h) => { W = w; H = h; draw(); });
  }

  function bleedLab(data) {
    const fig = document.getElementById('lab-bleed'); if (!fig) return;
    const C = data.bleed.curves, G = ['0.5', '0.75', '1 (as trained)', '1.5', '2'];
    const svg = fig.querySelector('svg'), read = fig.querySelector('[data-role="read"]'), rg = fig.querySelector('[data-role="g"]'), og = fig.querySelector('[data-out="g"]');
    const name = { A: 'A · long · 23.2 ms', B: 'B · short · 5.8 ms', C: 'C · dual · 5.8 ms', E: 'E · short · 2.9 ms', D: 'D · dual · 2.9 ms' };
    const groups = { de: ['D', 'E'], cb: ['C', 'B'], all: ['A', 'B', 'C', 'E', 'D'] };
    let g = 2, hl = 'de', W = 0, H = 0;
    function draw() {
      if (!W || !H) return;
      clear(svg); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const narrow = W < 560, l = narrow ? 40 : 56, r = W - (narrow ? 20 : 150), t = 18, b = H - 40;
      const x = scale(7, 13, l, r), y = scale(-1.4, -.2, b, t);
      [7, 8, 9, 10, 11, 12, 13].forEach(v => { el('line', { x1: x(v), x2: x(v), y1: t, y2: b, stroke: '#1f1f1f' }, svg); txt(svg, x(v), b + 16, `${v} dB`, { class: 't-muted', 'text-anchor': 'middle' }); });
      [-1.4, -1.0, -.6, -.2].forEach(v => { el('line', { x1: l - 4, x2: r, y1: y(v), y2: y(v), stroke: '#1f1f1f' }, svg); txt(svg, l - 8, y(v), v.toFixed(1), { class: 't-muted', 'text-anchor': 'end', dy: '.35em' }); });
      txt(svg, r, b + 32, narrow ? 'band removed (dB) →' : 'band removed (bleed attenuation) →', { class: 't-muted', 'text-anchor': 'end' });
      txt(svg, l, t - 6, narrow ? '↑ voice kept (dB)' : '↑ voice kept (vocal loss in dB, nearer 0 is better)', { class: 't-muted' });
      const on = groups[hl];
      Object.entries(C).forEach(([k, pts]) => {
        const active = on.includes(k), dual = k === 'C' || k === 'D';
        el('path', { d: pts.map(([a, v], j) => `${j ? 'L' : 'M'}${x(a).toFixed(1)},${y(v).toFixed(1)}`).join(' '), fill: 'none', stroke: dual ? '#fff' : '#8a8a8a', 'stroke-width': active ? 1.8 : 1, 'stroke-dasharray': k === 'A' ? '3 3' : '', opacity: active ? 1 : .25 }, svg);
        const [a, v] = pts[g];
        el('circle', { cx: x(a), cy: y(v), r: active ? 6 : 3.5, fill: dual ? '#fff' : '#8a8a8a', stroke: '#0b0b0b', 'stroke-width': 1.5, opacity: active ? 1 : .35 }, svg);
        if (active) {
          const last = pts[pts.length - 1];
          if (!narrow) txt(svg, x(last[0]) + 10, y(last[1]) + 4, name[k], { class: dual ? 't-hi' : 't-soft' });
          else txt(svg, x(a) + 9, y(v) - 9, k, { class: dual ? 't-hi' : 't-soft' });
        }
      });
      og.textContent = G[g];
      read.innerHTML = on.map(k => { const [a, v] = C[k][g]; return `<span><b>${k}</b>${Math.abs(v).toFixed(2)} dB voice lost · ${a.toFixed(1)} dB band removed</span>`; }).join('');
    }
    rg.addEventListener('input', () => { g = +rg.value; draw(); });
    const mark = seg(fig.querySelector('[data-role="pair"]'), [['de', '2.9 ms · D vs E'], ['cb', '5.8 ms · C vs B'], ['all', 'all five']], hl, id => { hl = id; mark(id); draw(); });
    observe(svg.parentElement, (w, h) => { W = w; H = h; draw(); });
  }

  citations();
  fetch('data.json').then(r => r.json()).then(data => { windowLab(data); songLab(data); bleedLab(data); }).catch(e => console.error(e));
})();
