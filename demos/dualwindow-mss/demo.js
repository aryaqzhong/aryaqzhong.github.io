(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtT = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

  let M, ctx = null;
  const st = { song: null, scenario: "mix", versions: [], current: null, buffers: {}, sources: [], gains: {},
    playing: false, offset: 0, t0: 0, raf: 0, loadToken: 0 };

  function audioCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }
  const duration = () => Math.min(...Object.values(st.buffers).map((b) => b.duration));
  const position = () => (st.playing ? audioCtx().currentTime - st.t0 : st.offset);

  function stopSources() {
    st.sources.forEach((s) => { try { s.stop(); } catch (e) {  } });
    st.sources = [];
    st.gains = {};
  }

  function start(at) {
    const c = audioCtx();
    stopSources();
    st.versions.forEach((v) => {
      const b = st.buffers[v.id];
      if (!b) return;
      const src = c.createBufferSource();
      src.buffer = b;
      const g = c.createGain();
      g.gain.value = v.id === st.current ? 1 : 0;
      src.connect(g).connect(c.destination);
      src.start(c.currentTime + 0.03, at);
      st.sources.push(src);
      st.gains[v.id] = g;
    });
    st.t0 = c.currentTime + 0.03 - at;
    st.playing = true;
    $("#play").textContent = "❚❚ Pause";
    cancelAnimationFrame(st.raf);
    tick();
  }

  function pause() {
    st.offset = Math.max(0, position());
    stopSources();
    st.playing = false;
    $("#play").textContent = "▶ Play";
    cancelAnimationFrame(st.raf);
    drawHead();
  }

  function tick() {
    const d = duration();
    if (position() >= d) {
      if ($("#loop").checked) start(0); else { pause(); st.offset = 0; drawHead(); return; }
    }
    drawHead();
    st.raf = requestAnimationFrame(tick);
  }

  function drawHead() {
    const d = duration() || 1, p = Math.min(position(), d);
    $("#playhead").style.left = `${(100 * p) / d}%`;
    $("#time").textContent = `${fmtT(p)} / ${fmtT(d)}`;
  }

  function select(id) {
    st.current = id;
    const c = ctx;
    Object.entries(st.gains).forEach(([k, g]) => g.gain.setTargetAtTime(k === id ? 1 : 0, c.currentTime, 0.008));
    document.querySelectorAll("#versions button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.id === id)));
    $("#spec-img").src = `audio/${st.song.slug}/${id}.png`;
  }

  async function loadSet() {
    const token = ++st.loadToken;
    const wasPlaying = st.playing;
    if (st.playing) pause();
    st.offset = 0;
    st.buffers = {};
    const song = st.song;
    st.versions = st.scenario === "bleed" && song.bleed ? song.bleed : song.versions;
    if (!st.versions.some((v) => v.id === st.current)) {
      const pref = st.versions.find((v) => v.id === "C_dual" || v.id === "bleed_C_dual");
      st.current = (pref || st.versions[0]).id;
    }
    renderVersions();
    $("#status").textContent = "Loading audio…";
    $("#play").disabled = true;
    const c = audioCtx();
    try {
      await Promise.all(st.versions.map(async (v) => {
        const r = await fetch(`audio/${song.slug}/${v.id}.mp3`);
        if (!r.ok) throw new Error(`${v.id}: HTTP ${r.status}`);
        const buf = await c.decodeAudioData(await r.arrayBuffer());
        if (token === st.loadToken) st.buffers[v.id] = buf;
      }));
    } catch (e) {
      if (token === st.loadToken) $("#status").textContent = `Could not load audio (${e.message}).`;
      return;
    }
    if (token !== st.loadToken) return;
    $("#status").textContent = "";
    $("#play").disabled = false;
    select(st.current);
    drawHead();
    if (wasPlaying) start(0);
  }

  function renderSongs() {
    const box = $("#songs");
    box.innerHTML = "";
    M.songs.forEach((s) => {
      const b = document.createElement("button");
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(st.song && s.slug === st.song.slug));
      b.innerHTML = `${esc(s.title)}<small>${esc(s.artist)}</small>`;
      b.onclick = () => { st.song = s; if (!s.bleed) st.scenario = "mix"; renderSongs(); renderScenarios(); loadSet(); };
      box.appendChild(b);
    });
    const s = st.song;
    const lic = `<a href="${esc(s.license_url)}" rel="noopener">CC ${esc(s.license_url.split("/licenses/")[1].replace(/\/$/, "").replace("/", " ").toUpperCase())}</a>`;
    $("#attribution").innerHTML = `“<a href="${esc(s.page)}" rel="noopener">${esc(s.title)}</a>” by ${esc(s.artist)}${s.artist_real_name && s.artist_real_name.toLowerCase() !== s.artist.toLowerCase() ? ` (${esc(s.artist_real_name)})` : ""}${s.featuring ? `, featuring ${esc(s.featuring)}` : ""}, ccMixter, ${lic}. Excerpt ${fmtT(s.excerpt_start_s)}–${fmtT(s.excerpt_start_s + s.excerpt_s)}, converted to mono and separated by the models below.`;
  }

  function renderScenarios() {
    const box = $("#scenarios");
    box.innerHTML = "";
    const opts = [["mix", "Full mix"]];
    if (st.song.bleed) opts.push(["bleed", "Vocal mic with bleed (simulated)"]);
    opts.forEach(([k, label]) => {
      const b = document.createElement("button");
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(st.scenario === k));
      b.textContent = label;
      b.onclick = () => { if (st.scenario !== k) { st.scenario = k; renderScenarios(); loadSet(); } };
      box.appendChild(b);
    });
  }

  function renderVersions() {
    const box = $("#versions");
    box.innerHTML = "";
    st.versions.forEach((v, i) => {
      const b = document.createElement("button");
      b.dataset.id = v.id;
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(v.id === st.current));
      if (v.kind === "offline") b.classList.add("offline");
      const lat = v.latency_ms ? `${v.latency_ms} ms latency` : v.kind === "offline" ? "offline, non-causal"
        : v.kind === "input" ? "input" : "reference";
      b.innerHTML = `<span class="k">${i + 1}</span><span>${esc(v.label)}</span><span class="lat">${lat}</span>`;
      b.onclick = () => select(v.id);
      box.appendChild(b);
    });
  }

  function renderModels() {
    const rows = M.models || [];
    if (!rows.length) { $("#models").innerHTML = '<p class="note">Model results are not available yet.</p>'; return; }
    const pct = (v) => (v === null || v === undefined ? "–" : `${(100 * v).toFixed(2)}%`);
    $("#models").innerHTML = `<table><thead><tr><th>Model</th><th class="num">Algorithmic latency</th>
      <th class="num">Test-set SI-SDR</th><th class="num">Per-hop compute, P99 (hop)</th>
      <th class="num">Hops over deadline</th><th class="num">Real-time factor</th></tr></thead><tbody>${rows.map((r) =>
      `<tr><td>${esc(r.label)}</td><td class="num">${r.latency_ms ? `${r.latency_ms} ms` : "offline"}</td>
      <td class="num">${r.si_sdr.toFixed(2)} dB</td>
      <td class="num">${r.p99_ms === null || r.p99_ms === undefined ? "–" : `${r.p99_ms.toFixed(2)} ms (${r.hop_ms.toFixed(2)} ms)`}</td>
      <td class="num">${pct(r.deadline_miss)}</td>
      <td class="num">${r.rtf === null ? "–" : r.rtf.toFixed(3)}</td></tr>`).join("")}
      </tbody></table>`;
  }

  function bind() {
    $("#play").onclick = async () => {
      await audioCtx().resume();
      if (st.playing) pause(); else start(st.offset >= duration() ? 0 : st.offset);
    };
    $("#spec").onclick = (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      const t = ((e.clientX - r.left) / r.width) * duration();
      if (st.playing) start(t); else { st.offset = t; drawHead(); }
    };
    document.addEventListener("keydown", (e) => {
      if (e.target.closest("input, select, textarea")) return;
      if (e.code === "Space") { e.preventDefault(); $("#play").click(); }
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= st.versions.length) select(st.versions[n - 1].id);
    });
  }

  async function boot() {
    try {
      M = await (await fetch("demo.json")).json();
    } catch (e) {
      $("#loading").textContent = `Could not load demo.json (${e.message}). Serve this folder over HTTP.`;
      return;
    }
    $("#loading").remove();
    $("#player").hidden = false;
    st.song = M.songs[0];
    bind();
    renderSongs();
    renderScenarios();
    renderModels();
    loadSet();
  }
  boot();
})();
