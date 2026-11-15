(() => {
  const root = document.getElementById('desk');
  if (!root) return;
  const $ = s => root.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtT = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const credit = document.getElementById('attribution');
  let M, ctx = null, booted = false;
  const st = { song: null, scenario: 'mix', versions: [], current: null, buffers: {}, sources: [], gains: {}, playing: false, offset: 0, t0: 0, raf: 0, loadToken: 0 };
  const audioCtx = () => ctx || (ctx = new (window.AudioContext || window.webkitAudioContext)());
  const duration = () => { const d = Object.values(st.buffers).map(b => b.duration); return d.length ? Math.min(...d) : 0; };
  const position = () => (st.playing ? audioCtx().currentTime - st.t0 : st.offset);

  function stopSources() {
    st.sources.forEach(s => { try { s.stop(); } catch (e) {} });
    st.sources = []; st.gains = {};
  }
  function start(at) {
    const c = audioCtx();
    stopSources();
    st.versions.forEach(v => {
      const b = st.buffers[v.id]; if (!b) return;
      const src = c.createBufferSource(); src.buffer = b;
      const g = c.createGain(); g.gain.value = v.id === st.current ? 1 : 0;
      src.connect(g).connect(c.destination);
      src.start(c.currentTime + .03, at);
      st.sources.push(src); st.gains[v.id] = g;
    });
    st.t0 = c.currentTime + .03 - at;
    st.playing = true;
    $('#play').textContent = '❚❚ Pause';
    cancelAnimationFrame(st.raf); tick();
  }
  function pause() {
    st.offset = Math.max(0, position());
    stopSources();
    st.playing = false;
    $('#play').textContent = '▶ Play';
    cancelAnimationFrame(st.raf); drawHead();
  }
  function tick() {
    const d = duration();
    if (position() >= d) {
      if ($('#loop').checked) start(0); else { pause(); st.offset = 0; drawHead(); return; }
    }
    drawHead();
    st.raf = requestAnimationFrame(tick);
  }
  function drawHead() {
    const d = duration() || 1, p = Math.min(position(), d);
    $('.playhead').style.left = `${(100 * p) / d}%`;
    $('.time').textContent = `${fmtT(p)} / ${fmtT(duration())}`;
  }
  function modelOf(id) { return id.replace(/^bleed_/, ''); }
  function select(id) {
    st.current = id;
    if (ctx) Object.entries(st.gains).forEach(([k, g]) => g.gain.setTargetAtTime(k === id ? 1 : 0, ctx.currentTime, .008));
    root.querySelectorAll('#versions .opt').forEach(b => b.setAttribute('aria-checked', String(b.dataset.id === id)));
    $('#spec-img').src = `audio/${st.song.slug}/${id}.png`;
    const mid = modelOf(id);
    root.querySelectorAll('#models tr[data-id]').forEach(tr => tr.classList.toggle('sel', tr.dataset.id === mid));
  }
  async function loadSet() {
    const token = ++st.loadToken, wasPlaying = st.playing;
    if (st.playing) pause();
    st.offset = 0; st.buffers = {};
    const song = st.song;
    st.versions = st.scenario === 'bleed' && song.bleed ? song.bleed : song.versions;
    if (!st.versions.some(v => v.id === st.current)) {
      const pref = st.versions.find(v => v.id === 'C_dual' || v.id === 'bleed_C_dual');
      st.current = (pref || st.versions[0]).id;
    }
    renderVersions();
    $('.status').textContent = `loading ${st.versions.length} versions…`;
    $('#play').disabled = true;
    const c = audioCtx();
    try {
      await Promise.all(st.versions.map(async v => {
        const r = await fetch(`audio/${song.slug}/${v.id}.mp3`);
        if (!r.ok) throw new Error(`${v.id}: HTTP ${r.status}`);
        const buf = await c.decodeAudioData(await r.arrayBuffer());
        if (token === st.loadToken) st.buffers[v.id] = buf;
      }));
    } catch (e) {
      if (token === st.loadToken) $('.status').textContent = `could not load audio (${e.message})`;
      return;
    }
    if (token !== st.loadToken) return;
    $('.status').textContent = '';
    $('#play').disabled = false;
    select(st.current); drawHead();
    if (wasPlaying) start(0);
  }
  function renderSongs() {
    const box = $('#songs'); box.innerHTML = '';
    M.songs.forEach(s => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'opt'; b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(st.song && s.slug === st.song.slug));
      b.innerHTML = `<span class="nm">${esc(s.title)}<small>${esc(s.artist)}</small></span>`;
      b.onclick = () => { if (st.song === s) return; st.song = s; if (!s.bleed) st.scenario = 'mix'; renderSongs(); renderScenes(); loadSet(); };
      box.appendChild(b);
    });
    const s = st.song;
    const lic = `<a href="${esc(s.license_url)}" rel="noopener">CC ${esc(s.license_url.split('/licenses/')[1].replace(/\/$/, '').replace('/', ' ').toUpperCase())}</a>`;
    const real = s.artist_real_name && s.artist_real_name.toLowerCase() !== s.artist.toLowerCase() ? ` (${esc(s.artist_real_name)})` : '';
    credit.innerHTML = `Now on the desk: “<a href="${esc(s.page)}" rel="noopener">${esc(s.title)}</a>” by ${esc(s.artist)}${real}${s.featuring ? `, featuring ${esc(s.featuring)}` : ''}, ccMixter, ${lic}. Excerpt ${fmtT(s.excerpt_start_s)}–${fmtT(s.excerpt_start_s + s.excerpt_s)}, converted to mono, separated by the models above and loudness-matched.`;
  }
  function renderScenes() {
    const box = $('#scenes'); box.innerHTML = '';
    const opts = [['mix', 'Full mix', 'the band and the voice together'], ['bleed', 'Vocal mic with bleed', 'the band leaking in 5 dB below the voice']];
    opts.forEach(([k, label, sub]) => {
      if (k === 'bleed' && !st.song.bleed) return;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'opt'; b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(st.scenario === k));
      b.innerHTML = `<span class="nm">${label}<small>${sub}</small></span>`;
      b.onclick = () => { if (st.scenario !== k) { st.scenario = k; renderScenes(); loadSet(); } };
      box.appendChild(b);
    });
  }
  function renderVersions() {
    const box = $('#versions'); box.innerHTML = '';
    st.versions.forEach((v, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'opt key' + (v.kind === 'offline' ? ' offline' : v.kind === 'reference' ? ' ref' : '');
      b.dataset.id = v.id; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(v.id === st.current));
      const lat = v.latency_ms ? `${v.latency_ms} ms` : v.kind === 'offline' ? 'offline' : v.kind === 'input' ? 'input' : 'reference';
      b.innerHTML = `<span class="k">${i + 1}</span><span class="nm">${esc(v.label.replace(' · offline reference', '').replace('Original vocal stem', 'Vocal stem'))}</span><span class="lat">${lat}</span>`;
      b.onclick = () => select(v.id);
      box.appendChild(b);
    });
  }
  function renderModels() {
    const rows = M.models || [];
    const pct = v => (v === null || v === undefined ? '–' : `${(100 * v).toFixed(2)}%`);
    $('#models').innerHTML = `<table><thead><tr><th>Model</th><th class="num">Latency</th><th class="num">SI-SDR</th><th class="num">P99 per hop</th><th class="num">Late hops</th><th class="num">RTF</th></tr></thead><tbody>${rows.map(r =>
      `<tr data-id="${esc(r.id)}"><td>${esc(r.label)}</td><td class="num">${r.latency_ms ? `${r.latency_ms} ms` : 'offline'}</td><td class="num">${r.si_sdr.toFixed(2)} dB</td><td class="num">${r.p99_ms === null || r.p99_ms === undefined ? '–' : `${r.p99_ms.toFixed(2)} / ${r.hop_ms.toFixed(2)} ms`}</td><td class="num">${pct(r.deadline_miss)}</td><td class="num">${r.rtf === null || r.rtf === undefined ? '–' : r.rtf.toFixed(3)}</td></tr>`).join('')}</tbody></table>`;
  }
  const active = () => root.matches(':hover') || root.contains(document.activeElement);
  function bind() {
    $('#play').onclick = async () => {
      await audioCtx().resume();
      if (st.playing) pause(); else start(st.offset >= duration() ? 0 : st.offset);
    };
    $('#spec').onclick = e => {
      if (!duration()) return;
      const r = e.currentTarget.getBoundingClientRect(), t = ((e.clientX - r.left) / r.width) * duration();
      if (st.playing) start(t); else { st.offset = t; drawHead(); }
    };
    const img = $('#spec-img');
    img.addEventListener('load', () => { if (img.naturalWidth) $('#spec').style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`; });
    document.addEventListener('keydown', e => {
      if (!active() || e.target.closest('input, select, textarea')) return;
      if (e.code === 'Space') { e.preventDefault(); if (!$('#play').disabled) $('#play').click(); }
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= st.versions.length) select(st.versions[n - 1].id);
    });
  }
  async function boot() {
    if (booted) return; booted = true;
    try { M = await (await fetch('demo.json')).json(); }
    catch (e) { $('.status').textContent = `could not load demo.json (${e.message})`; console.error(e); return; }
    st.song = M.songs[0];
    bind(); renderSongs(); renderScenes(); renderModels(); loadSet();
  }
  if ('IntersectionObserver' in window) new IntersectionObserver((es, io) => { if (es.some(e => e.isIntersecting)) { io.disconnect(); boot(); } }, { rootMargin: '900px 0px' }).observe(root);
  else boot();
})();
