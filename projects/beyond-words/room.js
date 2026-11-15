(() => {
  const root = document.getElementById('room'), rateRoot = document.getElementById('rate');
  if (!root || !rateRoot) return;
  const X = window.Explainer, { el, scale, clamp } = X;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const f2 = v => v.toFixed(2), f1 = v => v.toFixed(1);
  const fs = (v, d) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d), fs2 = v => fs(v, 2), fs1 = v => fs(v, 1);
  const fpct = v => `${Math.round(v * 100)}%`, fint = v => v.toLocaleString('en-US');
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  const amin = a => Math.min(...a), amax = a => Math.max(...a);
  const WORK = { Beethoven_WoO80: 'Beethoven, WoO 80', 'Schubert_D935_no.3': 'Schubert, D 935 no. 3', Schubert_D960_mv2: 'Schubert, D 960, 2nd movement', Schubert_D960_mv3: 'Schubert, D 960, 3rd movement' };
  const LIBS = ['https://cdn.jsdelivr.net/npm/@tonejs/midi@2.0.28/build/Midi.js', 'https://cdn.jsdelivr.net/npm/tone@14.8.49/build/Tone.js'];
  let D, DESC, DIDX, FEAT, FIDX, SEG, PASS, R, libs = null, booted = false;
  const st = { a: null, b: null };
  const midiCache = new Map();

  const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error(`could not load ${src.split('/').pop()}`)); document.head.appendChild(s); });
  const ensureLibs = () => libs || (libs = Promise.all(LIBS.map(loadScript)));
  const pianist = k => `Pianist ${SEG[k].pianist}`;
  const passageOf = k => PASS[SEG[k].p];
  const fval = (k, id) => SEG[k].f[FIDX[id]], fz = (k, id) => SEG[k].z[FIDX[id]];
  const widthOf = (node, min = 300) => Math.max(min, Math.floor(node.getBoundingClientRect().width));
  const svgIn = (node, W, H) => { node.innerHTML = ''; return el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H }, node); };
  const txt = (parent, x, y, s, attrs = {}) => { const t = el('text', Object.assign({ x, y }, attrs), parent); t.textContent = s; return t; };
  const title = (parent, s) => { el('title', {}, parent).textContent = s; };
  function fmtFeature(id, v) {
    if (v === null || v === undefined) return '–';
    const u = FEAT[FIDX[id]].unit;
    if (u === 'share of time' || u === 'share of full depth') return fpct(v);
    const s = Math.abs(v) >= 100 ? v.toFixed(0) : Number(v.toPrecision(3)).toString();
    return s + (u ? ` ${u}` : '');
  }

  function comparePair(a, b) {
    const A = SEG[a], B = SEG[b];
    const rows = DESC.map((d, i) => {
      const ka = A.k[i], kb = B.k[i], tau2 = 2 * d.between_sd ** 2, e2 = d.resid_sd ** 2 * (1 / ka + 1 / kb), bshr = tau2 / (tau2 + e2);
      const delta = A.m[i] - B.m[i], mu = bshr * delta, q = (mu * mu + bshr * e2) / tau2;
      return { d, i, delta, std: delta / Math.sqrt(tau2), ci: 1.96 * Math.sqrt(e2) / Math.sqrt(tau2), q, noisy: d.between_sd < d.resid_sd / Math.sqrt((ka + kb) / 2), ka, kb, ma: A.m[i], mb: B.m[i] };
    });
    return { rows, Q: mean(rows.map(r => r.q)) };
  }
  function percentileBelow(Q) {
    const q = D.meta.q_percentiles; let i = 0; while (i < q.length && q[i] <= Q) i++;
    if (i <= 0) return 0; if (i >= q.length) return 1;
    return (i - 1 + (Q - q[i - 1]) / (q[i] - q[i - 1])) / 100;
  }

  function fillPassages() {
    const sel = $('#rm-passage'); sel.innerHTML = '';
    const groups = new Map();
    PASS.forEach((p, i) => { if (!groups.has(p.work)) groups.set(p.work, []); groups.get(p.work).push(i); });
    groups.forEach((idx, work) => {
      const og = document.createElement('optgroup'); og.label = WORK[work] || work.replace(/_/g, ' ');
      idx.forEach(i => og.appendChild(new Option(`${PASS[i].name} · ${PASS[i].keys.length} pianists`, i)));
      sel.appendChild(og);
    });
    sel.onchange = () => { const k = PASS[+sel.value].keys; setPair(k[0], k[1]); };
  }
  function setPair(a, b) {
    st.a = a; st.b = b;
    $('#rm-passage').value = SEG[a].p;
    $('#rm-passage-sub').textContent = `${passageOf(a).keys.length} pianists played this passage. A is white, B is outlined; tap another pianist to replace B, tap A or B to swap them.`;
    renderPianists(); renderExamples(); renderCompare();
  }
  function renderPianists() {
    const box = $('#rm-pianists'); box.innerHTML = '';
    passageOf(st.a).keys.forEach(k => {
      const b = document.createElement('button'); b.type = 'button';
      const role = k === st.a ? 'a' : k === st.b ? 'b' : '';
      b.className = 'chip' + (role ? ' ' + role : ''); b.setAttribute('aria-pressed', String(!!role));
      b.innerHTML = `${role ? `<i>${role.toUpperCase()}</i>` : ''}${esc(pianist(k))}`;
      b.onclick = () => { if (role) setPair(st.b, st.a); else setPair(st.a, k); };
      box.appendChild(b);
    });
  }
  const SHORT = { pedal_change_rate_hyst: 'pedal changes', soft_pedal_ratio: 'soft-pedal use', top_voice_onset_lead_ms: 'melody lead', top_voice_overlap_ratio: 'melody overlap' };
  function examples() {
    const list = [];
    ['soft_pedal_ratio', 'pedal_change_rate_hyst', 'top_voice_onset_lead_ms', 'top_voice_overlap_ratio'].forEach(f => {
      const c = D.cases.find(k => k.feature === f && k.rank === 1);
      if (c) list.push({ a: c.a, b: c.b, t: `Rated alike, different ${SHORT[f] || FEAT[FIDX[f]].name.toLowerCase()}`, s: `${passageOf(c.a).name} · ${pianist(c.a)} vs ${pianist(c.b)}` });
    });
    ['pedal_amount', 'mm_tempo', 'timing', 'interpretation'].forEach(id => {
      const d = DESC[DIDX[id]], c = d.contrasts && d.contrasts[0]; if (!c) return;
      list.push({ a: c.a, b: c.b, t: `Clearest contrast in ${d.name.toLowerCase()}`, s: `${passageOf(c.a).name} · ${pianist(c.a)} (${d.high}) vs ${pianist(c.b)}` });
    });
    return list;
  }
  function renderExamples() {
    const box = $('#rm-examples'); box.innerHTML = '';
    examples().forEach(e => {
      const b = document.createElement('button'); b.type = 'button';
      b.setAttribute('aria-pressed', String(e.a === st.a && e.b === st.b));
      b.innerHTML = `${esc(e.t)}<small>${esc(e.s)}</small>`;
      b.onclick = () => setPair(e.a, e.b);
      box.appendChild(b);
    });
  }

  function renderCompare() {
    const a = st.a, b = st.b, cmp = comparePair(a, b), pct = percentileBelow(cmp.Q), alike = cmp.Q <= D.meta.alike_threshold;
    const diffs = FEAT.map(f => ({ f, dz: (fz(a, f.id) ?? NaN) - (fz(b, f.id) ?? NaN) })).filter(d => Number.isFinite(d.dz)).sort((x, y) => Math.abs(y.dz) - Math.abs(x.dz));
    const minK = amin(cmp.rows.map(r => Math.min(r.ka, r.kb)));
    $('#rm-summary').innerHTML = `<div><b>${f2(cmp.Q)}</b><span>rating distance between A and B (1 = a typical pair)</span></div>
      <div><b>${fpct(1 - pct)}</b><span>${alike ? 'rated alike: ' : ''}more alike than this share of all ${fint(D.meta.n_pairs)} same-passage pairs</span></div>
      <div><b class="txt">${esc(diffs[0].f.name)}</b><span>largest playing difference, ${f2(Math.abs(diffs[0].dz))} SD</span></div>
      <div><b>≥ ${minK}</b><span>experts rated each of the two performances</span></div>`;
    drawRatingDiffs($('#rm-ratings'), cmp.rows, a, b);
    drawFeatureDiffs($('#rm-features'), diffs.slice(0, 10), a, b);
    drawRolls(a, b);
  }

  function drawRatingDiffs(node, rows, a, b) {
    const W = widthOf(node), m = { t: 8, r: 16, b: 34, l: 150 }, rowH = 20, H = m.t + m.b + rows.length * rowH;
    const lim = Math.max(3, Math.ceil(amax(rows.map(r => Math.abs(r.std) + r.ci))));
    const x = scale(-lim, lim, m.l, W - m.r), y = i => m.t + i * rowH + rowH / 2;
    const svg = svgIn(node, W, H);
    el('rect', { x: x(-1), width: x(1) - x(-1), y: m.t, height: H - m.t - m.b, fill: '#181818' }, svg);
    const ax = el('g', { class: 'ax' }, svg);
    for (let t = -lim; t <= lim; t++) { el('line', { x1: x(t), x2: x(t), y1: m.t, y2: H - m.b, stroke: t === 0 ? '#555' : '#1f1f1f' }, ax); txt(ax, x(t), H - m.b + 14, t === 0 ? '0' : fs(t, 0), { 'text-anchor': 'middle' }); }
    txt(svg, x(-lim), H - 4, `← ${pianist(b)} higher`, { class: 't-muted' });
    txt(svg, x(lim), H - 4, `${pianist(a)} higher →`, { 'text-anchor': 'end', class: 't-muted' });
    rows.forEach((r, i) => {
      const g = el('g', {}, svg);
      title(g, `${r.d.name} (1 = ${r.d.low}, 7 = ${r.d.high}) · ${pianist(a)} ${f2(r.ma)} (${r.ka} raters) · ${pianist(b)} ${f2(r.mb)} (${r.kb} raters) · difference ${fs2(r.std)} ± ${f2(r.ci)} typical units${r.noisy ? ' · too few raters to compare single performances on this scale' : ''}`);
      txt(g, m.l - 10, y(i), r.d.name, { 'text-anchor': 'end', dy: '.35em', class: r.noisy ? 't-muted' : 't-soft' });
      el('line', { x1: x(Math.max(-lim, r.std - r.ci)), x2: x(Math.min(lim, r.std + r.ci)), y1: y(i), y2: y(i), stroke: r.noisy ? '#444' : '#9a9a9a', 'stroke-width': 2, 'stroke-linecap': 'round' }, g);
      el('circle', { cx: x(r.std), cy: y(i), r: 4.2, fill: r.noisy ? '#555' : '#fff' }, g);
    });
  }
  function drawFeatureDiffs(node, rows, a, b) {
    const W = widthOf(node), m = { t: 6, r: 48, b: 30, l: 200 }, rowH = 22, H = m.t + m.b + rows.length * rowH;
    const lim = Math.max(2.5, Math.ceil(amax(rows.map(r => Math.abs(r.dz)))));
    const x = scale(-lim, lim, m.l, W - m.r);
    const svg = svgIn(node, W, H);
    const ax = el('g', { class: 'ax' }, svg);
    for (let t = -Math.floor(lim); t <= Math.floor(lim); t++) { el('line', { x1: x(t), x2: x(t), y1: m.t, y2: H - m.b, stroke: t === 0 ? '#555' : '#1f1f1f' }, ax); txt(ax, x(t), H - m.b + 14, t === 0 ? '0' : fs(t, 0), { 'text-anchor': 'middle' }); }
    txt(svg, x(-lim), H - 4, `← more in ${pianist(b)}`, { class: 't-muted' });
    txt(svg, x(lim), H - 4, `more in ${pianist(a)} →`, { 'text-anchor': 'end', class: 't-muted' });
    rows.forEach((r, i) => {
      const g = el('g', {}, svg), y0 = m.t + i * rowH, cand = r.f.role === 'candidate';
      title(g, `${r.f.name} · ${pianist(a)}: ${fmtFeature(r.f.id, fval(a, r.f.id))} · ${pianist(b)}: ${fmtFeature(r.f.id, fval(b, r.f.id))} · difference ${fs2(r.dz)} SD`);
      txt(g, m.l - 10, y0 + rowH / 2, r.f.name, { 'text-anchor': 'end', dy: '.35em', class: cand ? 't-hi' : 't-soft' });
      el('rect', { x: x(Math.min(0, r.dz)), width: Math.abs(x(r.dz) - x(0)), y: y0 + 4, height: rowH - 8, rx: 2, fill: cand ? '#fff' : '#6a6a6a' }, g);
      txt(g, (r.dz >= 0 ? x(r.dz) : x(0)) + 5, y0 + rowH / 2, fs2(r.dz), { dy: '.35em', class: 't-muted t-num' });
    });
  }

  async function loadMidi(key) {
    if (midiCache.has(key)) return midiCache.get(key);
    const pr = (async () => {
      await ensureLibs();
      const M = window.Midi && (window.Midi.Midi || window.Midi);
      if (!M) throw new Error('MIDI parser did not load');
      const res = await fetch(D.meta.midi_base + encodeURIComponent(SEG[key].midi));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const midi = new M(await res.arrayBuffer());
      const notes = [], cc = { 64: [], 67: [] };
      midi.tracks.forEach(t => {
        t.notes.forEach(n => notes.push({ t: n.time, d: n.duration, p: n.midi, v: Math.round(n.velocity * 127) }));
        [64, 67].forEach(num => (t.controlChanges[num] || []).forEach(c => cc[num].push({ t: c.time, v: c.value * 127 })));
      });
      notes.sort((x, y) => x.t - y.t);
      const t0 = amin(notes.map(n => n.t)), t1 = amax(notes.map(n => n.t + n.d));
      const steps = ev => {
        ev.sort((x, y) => x.t - y.t);
        let v = 0; const out = [];
        ev.forEach(e => { if (e.t <= t0) v = e.v; });
        out.push({ t: 0, v });
        ev.forEach(e => { if (e.t > t0 && e.t < t1) out.push({ t: e.t - t0, v: e.v }); });
        out.push({ t: t1 - t0, v: out[out.length - 1].v });
        return out;
      };
      return { notes: notes.map(n => ({ ...n, t: n.t - t0 })), cc64: steps(cc[64]), cc67: steps(cc[67]), dur: t1 - t0 };
    })();
    midiCache.set(key, pr);
    pr.catch(() => midiCache.delete(key));
    return pr;
  }

  function drawRoll(holder, mid, dur, pr) {
    const W = widthOf(holder), m = { t: 8, r: 10, b: 20, l: 36 }, hRoll = 150, hPed = 40, gap = 10, H = m.t + hRoll + gap + hPed + m.b;
    const x = scale(0, dur, m.l, W - m.r), y = scale(pr[0], pr[1], m.t + hRoll, m.t), yp = scale(0, 127, m.t + hRoll + gap + hPed, m.t + hRoll + gap);
    const svg = svgIn(holder, W, H);
    for (let p = Math.ceil(pr[0] / 12) * 12; p <= pr[1]; p += 12) { el('line', { x1: m.l, x2: W - m.r, y1: y(p), y2: y(p), stroke: '#1f1f1f' }, svg); txt(svg, m.l - 5, y(p), `C${p / 12 - 1}`, { 'text-anchor': 'end', dy: '.35em', class: 't-muted' }); }
    const nh = Math.max(2, Math.abs(y(0) - y(1)) * .8);
    mid.notes.forEach(n => el('rect', { x: x(n.t).toFixed(1), y: (y(n.p) - nh / 2).toFixed(1), width: Math.max(1.5, x(n.t + n.d) - x(n.t)).toFixed(1), height: nh.toFixed(1), rx: 1, fill: `rgba(255,255,255,${(.22 + .78 * clamp((n.v - 20) / 90)).toFixed(2)})` }, svg));
    el('line', { x1: m.l, x2: W - m.r, y1: m.t + hRoll + gap - 1, y2: m.t + hRoll + gap - 1, stroke: '#1f1f1f' }, svg);
    const step = ev => { let d = `M${x(ev[0].t).toFixed(1)},${yp(ev[0].v).toFixed(1)}`; for (let i = 1; i < ev.length; i++) d += `H${x(ev[i].t).toFixed(1)}V${yp(ev[i].v).toFixed(1)}`; return d; };
    el('path', { d: step(mid.cc64), fill: 'none', stroke: '#8a8a8a', 'stroke-width': 1.4 }, svg);
    el('path', { d: step(mid.cc67), fill: 'none', stroke: '#fff', 'stroke-width': 1.4, 'stroke-dasharray': '4 3' }, svg);
    txt(svg, m.l - 5, yp(127) + 8, 'down', { 'text-anchor': 'end', class: 't-muted' });
    txt(svg, m.l - 5, yp(0), 'up', { 'text-anchor': 'end', class: 't-muted' });
    const tick = dur > 24 ? 5 : 2;
    for (let s = 0; s <= dur; s += tick) txt(svg, x(s), H - 5, `${s}s`, { 'text-anchor': s === 0 ? 'start' : 'middle', class: 't-muted' });
    holder.__x = x;
    holder.__head = el('line', { class: 'playhead', x1: x(0), x2: x(0), y1: m.t, y2: H - m.b, stroke: '#fff', 'stroke-width': 1.5, visibility: 'hidden' }, svg);
  }

  let rollToken = 0;
  async function drawRolls(a, b) {
    const token = ++rollToken;
    player.stop();
    const boxes = [[$('#roll-a'), a, 'A'], [$('#roll-b'), b, 'B']];
    boxes.forEach(([box, key, tag]) => {
      box.innerHTML = `<div class="head"><span class="tag">${tag}</span><b>${esc(pianist(key))}</b><span>soft pedal down ${fpct(fval(key, 'soft_pedal_ratio'))} of the time · sustain down ${fpct(fval(key, 'pedal_coverage_ratio'))}</span><button class="rbtn" type="button" data-play="${esc(key)}" disabled>▶ Play</button></div><div class="status">loading MIDI from the PercePiano repository…</div><div class="holder"></div>`;
    });
    let parsed;
    try { parsed = await Promise.all([loadMidi(a), loadMidi(b)]); }
    catch (e) { if (token === rollToken) boxes.forEach(([box]) => { box.querySelector('.status').textContent = `Could not load the MIDI file from the PercePiano repository (${e.message}).`; }); return; }
    if (token !== rollToken) return;
    const dur = amax(parsed.map(p => p.dur)), all = parsed.flatMap(p => p.notes);
    const pr = [amin(all.map(n => n.p)) - 2, amax(all.map(n => n.p)) + 2];
    boxes.forEach(([box, key], i) => {
      box.querySelector('.status').remove();
      const holder = box.querySelector('.holder');
      drawRoll(holder, parsed[i], dur, pr);
      const btn = box.querySelector('button[data-play]');
      btn.disabled = false;
      btn.onclick = () => player.toggle(key, parsed[i], holder, btn);
    });
  }

  const player = {
    sampler: null, ready: null, key: null, btn: null, raf: 0,
    async ensure() {
      await ensureLibs();
      if (!this.ready) {
        this.sampler = new Tone.Sampler({
          urls: { A0: 'A0.mp3', C1: 'C1.mp3', 'D#1': 'Ds1.mp3', 'F#1': 'Fs1.mp3', A1: 'A1.mp3', C2: 'C2.mp3', 'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3', A2: 'A2.mp3', C3: 'C3.mp3', 'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3', A3: 'A3.mp3', C4: 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3', A4: 'A4.mp3', C5: 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3', A5: 'A5.mp3', C6: 'C6.mp3', 'D#6': 'Ds6.mp3', 'F#6': 'Fs6.mp3', A6: 'A6.mp3', C7: 'C7.mp3', 'D#7': 'Ds7.mp3', 'F#7': 'Fs7.mp3', A7: 'A7.mp3', C8: 'C8.mp3' },
          release: 1, baseUrl: 'https://tonejs.github.io/audio/salamander/',
        }).toDestination();
        this.ready = Tone.loaded();
      }
      return this.ready;
    },
    events(mid) {
      const ped = mid.cc64;
      const downAt = t => { let v = 0; for (const e of ped) { if (e.t <= t) v = e.v; else break; } return v >= 64; };
      const nextUp = t => { for (const e of ped) if (e.t > t && e.v < 64) return e.t; return mid.dur + 1; };
      return mid.notes.map(n => {
        const end = n.t + n.d, rel = downAt(end) ? Math.min(nextUp(end), end + 8) : end;
        return { t: n.t, dur: Math.max(.05, rel - n.t), note: Tone.Frequency(n.p, 'midi').toNote(), vel: Math.max(.05, n.v / 127) };
      });
    },
    async toggle(key, mid, holder, btn) {
      if (this.key === key) { this.stop(); return; }
      this.stop();
      btn.textContent = 'loading piano…';
      try { await Tone.start(); await this.ensure(); }
      catch (e) { btn.textContent = '▶ Play'; btn.title = `Audio unavailable: ${e.message}`; return; }
      const T = Tone.Transport;
      T.cancel(); T.stop(); T.seconds = 0;
      this.events(mid).forEach(ev => T.schedule(time => this.sampler.triggerAttackRelease(ev.note, ev.dur, time, ev.vel), ev.t));
      T.schedule(() => Tone.Draw.schedule(() => this.stop(), Tone.now()), mid.dur + 1.2);
      this.key = key; this.btn = btn; btn.textContent = '■ Stop';
      const head = holder.__head, x = holder.__x;
      if (head) head.setAttribute('visibility', 'visible');
      const tick = () => {
        const px = x(Math.min(T.seconds, mid.dur));
        if (head) { head.setAttribute('x1', px); head.setAttribute('x2', px); }
        this.raf = requestAnimationFrame(tick);
      };
      T.start('+0.05');
      tick();
    },
    stop() {
      cancelAnimationFrame(this.raf);
      if (window.Tone) { Tone.Transport.stop(); Tone.Transport.cancel(); if (this.sampler) this.sampler.releaseAll(); }
      if (this.btn) this.btn.textContent = '▶ Play';
      document.querySelectorAll('.playhead').forEach(h => h.setAttribute('visibility', 'hidden'));
      this.key = null; this.btn = null;
    },
  };

  const RATE_STORE = 'bw-explorer-ratings-v1';
  const rv = { key: null, mid: null, error: null, answers: {}, revealed: false, token: 0, history: [] };
  const rateStore = {
    load() { try { const v = JSON.parse(localStorage.getItem(RATE_STORE) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } },
    save(h) { try { localStorage.setItem(RATE_STORE, JSON.stringify(h)); } catch (e) {} },
    clear() { try { localStorage.removeItem(RATE_STORE); } catch (e) {} },
  };
  function rateCandidates() {
    const idx = R.scales.map(s => DIDX[s.id]);
    return Object.keys(SEG).filter(k => {
      const seg = SEG[k], dur = R.duration_s[k];
      return !seg.score && idx.every(i => seg.k[i] >= 5 && Number.isFinite(seg.m[i])) && (dur === undefined || (dur >= 6 && dur <= 35));
    });
  }
  function ratePick() {
    const all = rateCandidates().filter(k => k !== rv.key), done = new Set(rv.history.map(h => h.key));
    const fresh = all.filter(k => !done.has(k)), pool = fresh.length ? fresh : all;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function rateStart(key) {
    player.stop();
    Object.assign(rv, { key, mid: null, error: null, answers: {}, revealed: false });
    const token = ++rv.token;
    loadMidi(key).then(mid => { if (token === rv.token) { rv.mid = mid; drawRate(); } }).catch(e => { if (token === rv.token) { rv.error = e.message; drawRate(); } });
    drawRate();
  }
  function rateInit() {
    rv.history = rateStore.load().filter(h => h && SEG[h.key] && h.answers && R.scales.every(s => Number.isFinite(h.answers[s.id])));
    $('#rate-next').onclick = () => rateStart(ratePick());
    $('#rate-reset').onclick = () => { rv.history = []; rateStore.clear(); drawRateSession(); };
    rateStart(ratePick());
  }
  function drawRate() {
    const key = rv.key; if (!key) return;
    $('#rate-passage').innerHTML = `${esc(passageOf(key).name)}${rv.revealed ? `<br>${esc(pianist(key))}` : ''}`;
    const playBtn = $('#rate-play'), holder = $('#rate-progress');
    if (!(player.key === key && player.btn === playBtn)) {
      holder.innerHTML = ''; playBtn.textContent = '▶ Play';
      if (rv.mid) {
        const W = widthOf(holder, 200), svg = svgIn(holder, W, 22);
        el('line', { x1: 8, x2: W - 8, y1: 11, y2: 11, stroke: '#2a2a2a', 'stroke-width': 4, 'stroke-linecap': 'round' }, svg);
        holder.__head = el('line', { class: 'playhead', x1: 8, x2: 8, y1: 3, y2: 19, stroke: '#fff', 'stroke-width': 2, visibility: 'hidden' }, svg);
        holder.__x = scale(0, rv.mid.dur, 8, W - 8);
      }
    }
    playBtn.disabled = !rv.mid;
    playBtn.onclick = () => player.toggle(key, rv.mid, holder, playBtn);
    $('#rate-status').textContent = rv.error ? `Could not load the MIDI file from the PercePiano repository (${rv.error}).` : rv.mid ? `${rv.mid.dur.toFixed(0)} seconds. Listen as often as you like; the pianist stays hidden until you answer.` : 'loading MIDI from the PercePiano repository…';
    const form = $('#rate-form');
    form.innerHTML = R.scales.map(s => {
      const d = DESC[DIDX[s.id]];
      const options = [1, 2, 3, 4, 5, 6, 7].map(v => `<label><input type="radio" name="rate-${esc(s.id)}" value="${v}"${rv.answers[s.id] === v ? ' checked' : ''}${rv.revealed ? ' disabled' : ''}><span>${v}</span></label>`).join('');
      return `<fieldset><legend>${esc(d.name)}</legend><div class="rate-ends"><span>1 = ${esc(d.low)}</span><span>7 = ${esc(d.high)}</span></div><div class="rate-options">${options}</div></fieldset>`;
    }).join('');
    const reveal = $('#rate-reveal'), hint = $('#rate-hint');
    const update = () => {
      const left = R.scales.filter(s => !Number.isFinite(rv.answers[s.id])).length;
      reveal.disabled = rv.revealed || left > 0;
      hint.textContent = rv.revealed ? 'Answered. Try another performance when you are ready.' : left === 0 ? '' : `${left} of ${R.scales.length} scales left`;
    };
    update();
    form.onchange = ev => { const t = ev.target; if (t && t.name && t.name.startsWith('rate-')) { rv.answers[t.name.slice(5)] = +t.value; update(); } };
    reveal.onclick = () => {
      rv.revealed = true;
      rv.history = rv.history.filter(h => h.key !== key).concat({ key, answers: { ...rv.answers }, t: Date.now() });
      rateStore.save(rv.history);
      drawRate();
      $('#rate-result').scrollIntoView({ block: 'nearest', behavior: X.reduce ? 'auto' : 'smooth' });
    };
    const result = $('#rate-result');
    result.hidden = !rv.revealed;
    if (rv.revealed) {
      const seg = SEG[key], rows = $('#rate-rows'); rows.innerHTML = '';
      R.scales.forEach(s => {
        const i = DIDX[s.id], d = DESC[i], you = rv.answers[s.id];
        const row = document.createElement('div'); row.className = 'rate-row';
        row.innerHTML = `<div><div class="name">${esc(d.name)}</div><div class="vals">1 = ${esc(d.low)} · 7 = ${esc(d.high)}<br>you <b>${you}</b> · experts <b>${f1(seg.m[i])}</b> (${seg.k[i]} raters)</div></div><div class="chart"></div>`;
        rows.appendChild(row);
        drawRateRow(row.querySelector('.chart'), s, d, you, seg.m[i], seg.k[i]);
      });
      const roll = $('#rate-roll');
      roll.innerHTML = `<div class="head"><b>${esc(pianist(key))}</b><span>soft pedal down ${fpct(fval(key, 'soft_pedal_ratio'))} of the time · sustain down ${fpct(fval(key, 'pedal_coverage_ratio'))}</span></div><div class="holder"></div>`;
      if (rv.mid) drawRoll(roll.querySelector('.holder'), rv.mid, rv.mid.dur, [amin(rv.mid.notes.map(n => n.p)) - 2, amax(rv.mid.notes.map(n => n.p)) + 2]);
    }
    drawRateSession();
  }
  function drawRateRow(node, s, d, you, m, k) {
    const W = widthOf(node, 220), H = 60, cy = 30, pad = 16;
    const x = scale(1, 7, pad, W - pad), cl = v => Math.max(1, Math.min(7, v));
    const sd = Math.hypot(s.error_sd, s.leniency_sd), ci = 1.96 * s.error_sd / Math.sqrt(k);
    const svg = svgIn(node, W, H);
    title(svg, `${d.name} · you ${you} · experts' mean ${f1(m)} (95% CI ${f1(cl(m - ci))}–${f1(cl(m + ci))}, ${k} raters) · a single expert, ±1 SD: ${f1(cl(m - sd))}–${f1(cl(m + sd))}`);
    el('rect', { x: x(cl(m - sd)), width: x(cl(m + sd)) - x(cl(m - sd)), y: cy - 9, height: 18, rx: 4, fill: '#1f1f1f' }, svg);
    for (let v = 1; v <= 7; v++) { el('line', { x1: x(v), x2: x(v), y1: cy + 12, y2: cy + 16, stroke: '#444' }, svg); txt(svg, x(v), cy + 28, String(v), { 'text-anchor': 'middle', class: 't-muted' }); }
    el('line', { x1: x(cl(m - ci)), x2: x(cl(m + ci)), y1: cy, y2: cy, stroke: '#9a9a9a', 'stroke-width': 2, 'stroke-linecap': 'round' }, svg);
    el('circle', { cx: x(m), cy, r: 4.5, fill: '#fff' }, svg);
    const px = x(you), right = px < W - 70;
    el('circle', { cx: px, cy, r: 7, fill: 'none', stroke: '#fff', 'stroke-width': 1.5 }, svg);
    txt(svg, right ? px + 12 : px - 12, cy - 12, 'you', { 'text-anchor': right ? 'start' : 'end', class: 't-hi' });
    txt(svg, right ? px + 12 : px - 12, cy - 12, '', {});
  }
  function drawRateSession() {
    const Hh = rv.history, n = Hh.length;
    $('#rate-session').hidden = n === 0;
    if (!n) return;
    const typical = .798;
    const rows = R.scales.map(s => {
      const i = DIDX[s.id], diffs = Hh.map(h => h.answers[s.id] - SEG[h.key].m[i]), off = mean(diffs);
      return { d: DESC[i], off, raw: mean(diffs.map(Math.abs)), adj: n >= 3 ? mean(diffs.map(v => Math.abs(v - off))) * Math.sqrt(n / (n - 1)) : null, expertRaw: typical * Math.hypot(s.error_sd, s.leniency_sd), expertAdj: typical * s.error_sd };
    });
    $('#rate-session-sub').textContent = n >= 3
      ? `${n} performances rated. Your offset is how much higher or lower you rate than the experts on average: the same leniency the analysis removes for every expert before pianists are compared. Distances are in scale points from the experts' mean.`
      : `${n} performance${n > 1 ? 's' : ''} rated. From three on, this table also estimates your own offset from the experts. Distances are in scale points from the experts' mean.`;
    $('#rate-summary').innerHTML = `<table><thead><tr><th>Scale</th><th>You − experts, on average</th><th>Your typical distance</th><th>Same, your offset removed</th><th>A single expert: raw / leniency removed</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.d.name)}</td><td>${n >= 3 ? fs1(r.off) : '–'}</td><td>${f1(r.raw)}</td><td>${r.adj === null ? '–' : f1(r.adj)}</td><td>${f1(r.expertRaw)} / ${f1(r.expertAdj)}</td></tr>`).join('')}</tbody></table>`;
  }

  async function boot() {
    if (booted) return; booted = true;
    try {
      const [d, r] = await Promise.all([fetch('data/explorer.json').then(x => { if (!x.ok) throw new Error(`HTTP ${x.status}`); return x.json(); }), fetch('data/rate.json').then(x => (x.ok ? x.json() : null)).catch(() => null)]);
      D = d; R = r;
    } catch (e) {
      $('#rm-summary').innerHTML = `<div><b class="txt">The data did not load</b><span>${esc(e.message)}</span></div>`;
      console.error(e); return;
    }
    DESC = D.descriptors.map((d, i) => ({ ...d, index: i }));
    DIDX = Object.fromEntries(DESC.map((d, i) => [d.id, i]));
    FEAT = D.features; FIDX = Object.fromEntries(D.meta.feature_ids.map((id, i) => [id, i]));
    SEG = D.segments; PASS = D.passages;
    if (!R) R = { scales: ['mm_tempo', 'timing', 'pedal_amount', 'interpretation'].map(id => ({ id, leniency_sd: 0, error_sd: DESC[DIDX[id]].resid_sd })), duration_s: {} };
    fillPassages();
    const c = D.cases.find(k => k.feature === 'soft_pedal_ratio' && k.rank === 1) || D.cases[0];
    setPair(c.a, c.b);
    rateInit();
    ensureLibs().catch(e => console.error(e));
    let rt = 0;
    addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (!player.key) { renderCompare(); drawRate(); } }, 250); });
  }
  if ('IntersectionObserver' in window) new IntersectionObserver((es, io) => { if (es.some(e => e.isIntersecting)) { io.disconnect(); boot(); } }, { rootMargin: '900px 0px' }).observe(root);
  else boot();
})();
