(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };
  const scale = (d0, d1, r0, r1) => v => r0 + (v - d0) / (d1 - d0) * (r1 - r0);
  const scenes = {};

  function bar() {
    const top = document.querySelector('.xbar');
    if (!top) return () => {};
    const prog = top.querySelector('.xprogress'), pct = top.querySelector('.pct'), where = top.querySelector('.where');
    const btn = top.querySelector('.toc-btn'), toc = document.querySelector('.toc');
    const marks = [...document.querySelectorAll('[data-label]')];
    if (btn && toc) {
      btn.addEventListener('click', () => { const open = toc.classList.toggle('open'); btn.setAttribute('aria-expanded', open); });
      toc.addEventListener('click', e => { if (e.target.closest('a')) { toc.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); } });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') { toc.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); } });
    }
    const links = toc ? [...toc.querySelectorAll('a')] : [];
    let last = '';
    return () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      const f = max > 0 ? clamp(scrollY / max) : 0;
      prog.style.transform = `scaleX(${f})`;
      pct.textContent = Math.round(f * 100) + '%';
      const line = innerHeight * .42;
      let cur = null;
      for (const m of marks) if (m.getBoundingClientRect().top < line) cur = m;
      const text = cur ? cur.dataset.label : (where.dataset.start || '');
      if (text !== last) { where.textContent = text; last = text; }
      const chap = cur ? cur.closest('.chapter, .scrolly-wrap') : null;
      const id = cur && cur.dataset.nav || chap && (chap.id || (chap.previousElementSibling && chap.previousElementSibling.id));
      links.forEach(a => a.classList.toggle('on', !!id && a.getAttribute('href') === '#' + id));
    };
  }

  function scrolly() {
    const blocks = [...document.querySelectorAll('.scrolly[data-scene]')].map(root => {
      const s = scenes[root.dataset.scene];
      const steps = [...root.querySelectorAll('.step')];
      const stage = root.querySelector('.stage');
      if (s && s.init) s.init(stage, root);
      return { root, s, steps, stage, i: -2, p: -1 };
    });
    return () => {
      for (const b of blocks) {
        const r = b.root.getBoundingClientRect();
        if (r.bottom < -innerHeight * .5 || r.top > innerHeight * 1.5 || !b.s) continue;
        const sr = b.stage.getBoundingClientRect();
        const mobile = innerWidth <= 860;
        const line = mobile ? sr.bottom + (innerHeight - sr.bottom) * .32 : innerHeight * .5;
        let i = 0, p = 0;
        for (let k = 0; k < b.steps.length; k++) {
          const q = b.steps[k].getBoundingClientRect();
          if (line >= q.top) { i = k; p = clamp((line - q.top) / q.height); }
        }
        if (i !== b.i) b.steps.forEach((st, k) => st.classList.toggle('on', k === i));
        if (i !== b.i || Math.abs(p - b.p) > 1e-3) { b.s.update(i, p); b.i = i; b.p = p; }
      }
    };
  }

  function counters() {
    const nums = [...document.querySelectorAll('[data-count]')];
    if (!nums.length) return;
    const fmt = new Intl.NumberFormat('en-US');
    const run = n => {
      const to = +n.dataset.count, t0 = performance.now(), dur = reduce ? 0 : 1100;
      const tick = t => { const f = dur ? clamp((t - t0) / dur) : 1; n.textContent = fmt.format(Math.round(to * ease(f))); if (f < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { run(e.target); io.unobserve(e.target); } }), { threshold: .6 });
    nums.forEach(n => io.observe(n));
  }

  async function particles(hero, mode) {
    const canvas = hero.querySelector('canvas'), title = hero.querySelector('h1');
    if (!canvas || !title || !canvas.getContext) return;
    try { await document.fonts.load('500 80px "Instrument Sans"'); } catch (e) {}
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, dpr = 1, pts = [], mx = -1e4, my = -1e4, raf = 0, visible = true;
    const layout = () => {
      dpr = Math.min(2, devicePixelRatio || 1);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      const hb = hero.getBoundingClientRect(), tb = title.getBoundingClientRect(), cs = getComputedStyle(title);
      const off = document.createElement('canvas'); off.width = Math.ceil(W); off.height = Math.ceil(H);
      const o = off.getContext('2d');
      o.fillStyle = '#fff'; o.textAlign = 'center'; o.textBaseline = 'middle';
      o.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const lines = title.innerText.split('\n'), lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.05;
      const cy = tb.top - hb.top + tb.height / 2;
      lines.forEach((ln, k) => o.fillText(ln, W / 2, cy + (k - (lines.length - 1) / 2) * lh));
      const img = o.getImageData(0, 0, off.width, off.height).data;
      const fs = parseFloat(cs.fontSize), step = Math.max(2, Math.round(fs / 19));
      const old = pts; pts = [];
      for (let y = 0; y < off.height; y += step) for (let x = 0; x < off.width; x += step) {
        if (img[(y * off.width + x) * 4 + 3] > 140) {
          const p = old[pts.length];
          pts.push({ tx: x, ty: y, x: p ? p.x : Math.random() * W, y: p ? p.y : Math.random() * H, vx: 0, vy: 0,
                     a: Math.random() * Math.PI * 2, d: .5 + Math.random(), s: step });
        }
      }
      hero.classList.add('particles-on');
    };
    const draw = t => {
      raf = 0;
      if (!visible) return;
      const hp = clamp(scrollY / (hero.offsetHeight * .8));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const time = t / 1000;
      for (const p of pts) {
        let gx = p.tx, gy = p.ty;
        if (mode === 'wave') gy += Math.sin(p.tx / W * 14 - time * 2.2) * 2.2 * (1 - hp);
        if (mode === 'roll') gx += Math.sin(time * .9 + p.ty * .05) * 1.4 * (1 - hp);
        gx += Math.cos(p.a) * hp * 260 * p.d; gy += Math.sin(p.a) * hp * 200 * p.d - hp * 60;
        const dx = p.x - mx, dy = p.y - my, d2 = dx * dx + dy * dy;
        if (d2 < 6400) { const f = (6400 - d2) / 6400 * 2.4; p.vx += dx / Math.sqrt(d2 + 1) * f; p.vy += dy / Math.sqrt(d2 + 1) * f; }
        p.vx = (p.vx + (gx - p.x) * .06) * .82; p.vy = (p.vy + (gy - p.y) * .06) * .82;
        p.x += p.vx; p.y += p.vy;
        const alpha = (.55 + .45 * Math.sin(time * 1.6 + p.a)) * (1 - hp * .85);
        ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
        if (mode === 'roll') ctx.fillRect(p.x - p.s * .34, p.y - .75, p.s * .68, 1.5);
        else { ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(.95, p.s * .21), 0, 6.283); ctx.fill(); }
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    const start = () => { if (!raf) raf = requestAnimationFrame(draw); };
    layout();
    if (reduce) pts.forEach(p => { p.x = p.tx; p.y = p.ty; });
    start();
    let rt = 0;
    addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { layout(); start(); }, 150); });
    hero.addEventListener('pointermove', e => { const b = canvas.getBoundingClientRect(); mx = e.clientX - b.left; my = e.clientY - b.top; start(); });
    hero.addEventListener('pointerleave', () => { mx = my = -1e4; });
    new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) start(); }).observe(hero);
    addEventListener('scroll', () => { if (reduce && visible) start(); }, { passive: true });
  }

  function boot(opts = {}) {
    const fns = [bar(), scrolly()];
    let ticking = false;
    const tick = () => { ticking = false; fns.forEach(f => f()); };
    const ask = () => { if (!ticking) { ticking = true; requestAnimationFrame(tick); } };
    addEventListener('scroll', ask, { passive: true });
    addEventListener('resize', ask);
    tick();
    counters();
    const hero = document.querySelector('.hero');
    if (hero) { if (opts.hero) opts.hero(hero); else particles(hero, opts.mode || 'dots'); }
  }

  window.Explainer = { scene: (name, s) => { scenes[name] = s; }, boot, el, scale, clamp, lerp, ease, reduce, particles };
})();
