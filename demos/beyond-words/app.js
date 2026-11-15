(() => {
  "use strict";

  const C = {
    blue: "#2a78d6", orange: "#eb6834", aqua: "#1baf7a", ink: "#0b0b0b", ink2: "#52514e", muted: "#898781",
    grid: "#e1e0d9", axis: "#c3c2b7", band: "#ecebe6", gray: "#b9b8b1", mid: "#f1f0ec",
  };
  const ROLE_COLOR = { candidate: C.orange, exploratory: C.aqua, other: C.blue };
  const VEL = d3.scaleSequential(d3.interpolateRgb("#9ec5f4", "#0d366b")).domain([20, 110]).clamp(true);
  const DIV = d3.scaleLinear().domain([-2, 0, 2]).range([C.blue, C.mid, C.orange]).clamp(true)
    .interpolate(d3.interpolateRgb);
  const PASSAGE_FEATURES = ["tempo_ratio", "pedal_mean_depth", "pedal_coverage_ratio", "velocity_mean",
    "soft_pedal_ratio", "pedal_change_rate_hyst"];
  const SHORT_FEATURE = { pedal_change_rate_hyst: "Pedal changes" };
  const GROUP_NAME = { dynamics: "Dynamics", voicing: "Voicing", timing: "Timing", articulation: "Articulation",
    pedal: "Pedal", texture: "Texture", score_timing: "Timing vs. score" };
  const f2 = d3.format(".2f"), fs2 = d3.format("+.2f"), fpct = d3.format(".0%"), fint = d3.format(",");
  const f1 = d3.format(".1f"), fs1 = d3.format("+.1f");

  let D, DESC, DIDX, FEAT, FIDX, SEG, PASS;
  const midiCache = new Map();

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tipEl = () => $("#tooltip");
  const tip = {
    show(html, ev) {
      const t = tipEl();
      t.innerHTML = html;
      t.hidden = false;
      const pad = 14, w = t.offsetWidth, h = t.offsetHeight;
      let x = ev.clientX + pad, y = ev.clientY + pad;
      if (x + w > window.innerWidth - 8) x = ev.clientX - w - pad;
      if (y + h > window.innerHeight - 8) y = ev.clientY - h - pad;
      t.style.left = `${Math.max(8, x)}px`;
      t.style.top = `${Math.max(8, y)}px`;
    },
    hide() { tipEl().hidden = true; },
  };
  const width = (node, min = 320) => Math.max(min, Math.floor(node.getBoundingClientRect().width));
  const pianist = (key) => `Pianist ${SEG[key].pianist}`;
  const passageOf = (key) => PASS[SEG[key].p];
  const featValue = (key, id) => SEG[key].f[FIDX[id]];
  const featZ = (key, id) => SEG[key].z[FIDX[id]];
  function fmtFeature(id, v) {
    if (v === null || v === undefined) return "–";
    const u = FEAT[FIDX[id]].unit;
    if (u === "share of time" || u === "share of full depth") return fpct(v);
    if (Math.abs(v) >= 100) return d3.format(".0f")(v) + (u ? ` ${u}` : "");
    return d3.format(".3~g")(v) + (u ? ` ${u}` : "");
  }

  function comparePair(a, b) {
    const A = SEG[a], B = SEG[b];
    const rows = DESC.map((d, i) => {
      const ka = A.k[i], kb = B.k[i];
      const tau2 = 2 * d.between_sd ** 2;
      const e2 = d.resid_sd ** 2 * (1 / ka + 1 / kb);
      const bshr = tau2 / (tau2 + e2);
      const delta = A.m[i] - B.m[i];
      const mu = bshr * delta;
      const q = (mu * mu + bshr * e2) / tau2;
      const kmed = (ka + kb) / 2;
      return {
        d, i, delta, std: delta / Math.sqrt(tau2), ci: 1.96 * Math.sqrt(e2) / Math.sqrt(tau2), q,
        noisy: d.between_sd < d.resid_sd / Math.sqrt(kmed), ka, kb, ma: A.m[i], mb: B.m[i],
      };
    });
    return { rows, Q: d3.mean(rows, (r) => r.q) };
  }
  function percentileBelow(Q) {
    const q = D.meta.q_percentiles;
    const i = d3.bisectRight(q, Q);
    if (i <= 0) return 0;
    if (i >= q.length) return 1;
    return (i - 1 + (Q - q[i - 1]) / (q[i] - q[i - 1])) / 100;
  }

  function route() {
    const h = decodeURIComponent(location.hash.replace(/^#/, ""));
    const [view, ...rest] = h.split("/");
    const v = ["overview", "descriptors", "passages", "compare", "rate"].includes(view) ? view : "overview";
    if (v !== route.last) { if (route.last) player.stop(); route.last = v; }
    document.querySelectorAll(".view").forEach((s) => { s.hidden = s.id !== `view-${v}`; });
    document.querySelectorAll("nav.tabs a").forEach((a) => a.classList.toggle("active", a.dataset.view === v));
    tip.hide();
    if (v === "overview") renderOverview();
    if (v === "descriptors") renderDescriptors(rest[0]);
    if (v === "passages") renderPassages(rest[0]);
    if (v === "compare") renderCompare(rest[0], rest[1]);
    if (v === "rate") renderRate(rest[0]);
  }
  const go = (hash) => { if (location.hash !== hash) location.hash = hash; else route(); };

  function renderOverview() {
    document.querySelectorAll('[data-meta="n_pairs"]').forEach((n) => { n.textContent = fint(D.meta.n_pairs); });
    drawCeilingChart($("#chart-ceiling"));
    drawPairChart($("#chart-pairs"));
  }

  function drawCeilingChart(node) {
    const rows = DESC.slice().sort((a, b) => b.ceiling - a.ceiling);
    const W = width(node), m = { t: 30, r: 24, b: 34, l: 168 }, rowH = 22;
    const H = m.t + m.b + rows.length * rowH;
    const x = d3.scaleLinear().domain([0, 1]).range([m.l, W - m.r]);
    const y = d3.scaleBand().domain(rows.map((d) => d.id)).range([m.t, H - m.b]).padding(0.3);
    node.innerHTML = "";
    const svg = d3.select(node).append("svg").attr("width", W).attr("height", H)
      .attr("role", "img").attr("aria-label", "Noise ceiling and variance explained per descriptor");
    svg.append("g").attr("class", "gridline").attr("transform", `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).ticks(5).tickSize(-(H - m.t - m.b)).tickFormat(""));
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(fpct));
    const lg = svg.append("g").attr("transform", `translate(${m.l},12)`);
    lg.append("circle").attr("cx", 6).attr("cy", 0).attr("r", 5.5).attr("fill", "#fff").attr("stroke", C.blue).attr("stroke-width", 2);
    lg.append("text").attr("x", 16).attr("y", 4).attr("class", "lbl-text").text("Noise ceiling");
    lg.append("circle").attr("cx", 122).attr("cy", 0).attr("r", 5).attr("fill", C.blue);
    lg.append("text").attr("x", 132).attr("y", 4).attr("class", "lbl-text").text("Explained by MIDI features (R²)");
    const g = svg.append("g").selectAll("g").data(rows).join("g")
      .attr("transform", (d) => `translate(0,${y(d.id) + y.bandwidth() / 2})`).style("cursor", "pointer")
      .on("click", (ev, d) => go(`#descriptors/${d.id}`))
      .on("mousemove", (ev, d) => tip.show(`<div class="t">${esc(d.name)} <span class="m">(${esc(d.low)} → ${esc(d.high)})</span></div>
        Noise ceiling ${f2(d.ceiling)}<br>R² from MIDI ${f2(d.r2)} [${f2(d.r2_ci[0])}, ${f2(d.r2_ci[1])}]<br>
        Share of the ceiling ${d.share === null ? "–" : fpct(d.share)}`, ev))
      .on("mouseleave", tip.hide);
    g.append("rect").attr("x", 0).attr("y", -rowH / 2).attr("width", W).attr("height", rowH).attr("fill", "transparent");
    g.append("text").attr("x", m.l - 10).attr("y", 4).attr("text-anchor", "end").attr("class", "lbl-text")
      .style("fill", C.ink).text((d) => d.name);
    g.append("line").attr("x1", (d) => x(Math.max(0, d.r2))).attr("x2", (d) => x(d.ceiling))
      .attr("stroke", "#cde2fb").attr("stroke-width", 4).attr("stroke-linecap", "round");
    g.append("circle").attr("cx", (d) => x(d.ceiling)).attr("r", 5.5).attr("fill", "#fff")
      .attr("stroke", C.blue).attr("stroke-width", 2);
    g.append("circle").attr("cx", (d) => x(Math.max(0, d.r2))).attr("r", 5).attr("fill", C.blue)
      .attr("stroke", "#fff").attr("stroke-width", 1.5);
  }

  function drawPairChart(node) {
    const rows = FEAT.filter((f) => f.pair_ratio !== null).sort((a, b) => a.pair_ratio - b.pair_ratio);
    const W = width(node), m = { t: 30, r: 24, b: 40, l: 230 }, rowH = 22;
    const H = m.t + m.b + rows.length * rowH;
    const x = d3.scaleLinear().domain([0.15, 1.45]).range([m.l, W - m.r]);
    const y = d3.scaleBand().domain(rows.map((d) => d.id)).range([m.t, H - m.b]).padding(0.3);
    const hasCases = new Set(D.cases.map((c) => c.feature));
    node.innerHTML = "";
    const svg = d3.select(node).append("svg").attr("width", W).attr("height", H)
      .attr("role", "img").attr("aria-label", "Feature differences among pairs rated alike");
    svg.append("g").attr("class", "gridline").attr("transform", `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).ticks(6).tickSize(-(H - m.t - m.b)).tickFormat(""));
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(6));
    svg.append("text").attr("x", x(1)).attr("y", H - 6).attr("text-anchor", "middle").attr("class", "lbl-text")
      .text("1 = no information");
    svg.append("line").attr("x1", x(1)).attr("x2", x(1)).attr("y1", m.t - 6).attr("y2", H - m.b)
      .attr("stroke", C.muted).attr("stroke-dasharray", "4 3");
    const lg = svg.append("g").attr("transform", `translate(${m.l},12)`);
    [["Blind-spot candidate", C.orange], ["Exploratory (H3)", C.aqua], ["Other feature", C.blue]].forEach(([t, c], i) => {
      lg.append("circle").attr("cx", i * 160 + 6).attr("cy", 0).attr("r", 5).attr("fill", c);
      lg.append("text").attr("x", i * 160 + 16).attr("y", 4).attr("class", "lbl-text").text(t);
    });
    const g = svg.append("g").selectAll("g").data(rows).join("g")
      .attr("transform", (d) => `translate(0,${y(d.id) + y.bandwidth() / 2})`)
      .style("cursor", (d) => (hasCases.has(d.id) ? "pointer" : "default"))
      .on("click", (ev, d) => {
        const c = D.cases.find((k) => k.feature === d.id && k.rank === 1) || D.cases.find((k) => k.feature === d.id);
        if (c) go(`#compare/${c.a}/${c.b}`);
      })
      .on("mousemove", (ev, d) => tip.show(`<div class="t">${esc(d.name)}</div>
        Ratio ${f2(d.pair_ratio)} [${f2(d.pair_ci[0])}, ${f2(d.pair_ci[1])}]
        ${d.icc !== null ? `<br>Performer consistency (ICC) ${f2(d.icc)}<br>R² predicted from the 19 descriptors ${fs2(d.r2)}` : ""}
        ${hasCases.has(d.id) ? '<br><span class="m">Click for example pairs</span>' : ""}`, ev))
      .on("mouseleave", tip.hide);
    g.append("rect").attr("x", 0).attr("y", -rowH / 2).attr("width", W).attr("height", rowH).attr("fill", "transparent");
    g.append("text").attr("x", m.l - 10).attr("y", 4).attr("text-anchor", "end").attr("class", "lbl-text")
      .style("fill", C.ink).style("font-weight", (d) => (d.role === "candidate" ? 700 : 400)).text((d) => d.name);
    g.append("line").attr("x1", (d) => x(d.pair_ci[0])).attr("x2", (d) => x(d.pair_ci[1]))
      .attr("stroke", (d) => ROLE_COLOR[d.role]).attr("stroke-width", 2.2).attr("stroke-opacity", 0.5)
      .attr("stroke-linecap", "round");
    g.append("circle").attr("cx", (d) => x(d.pair_ratio)).attr("r", 5).attr("fill", (d) => ROLE_COLOR[d.role])
      .attr("stroke", "#fff").attr("stroke-width", 1.5);
  }

  function renderDescriptors(id) {
    const cur = DESC.find((d) => d.id === id) || DESC[0];
    const list = $("#descriptor-list");
    list.innerHTML = "";
    [["low", "Sound / execution"], ["high", "Musical / affective"]].forEach(([lvl, name]) => {
      list.insertAdjacentHTML("beforeend", `<div class="grp">${name}</div>`);
      DESC.filter((d) => d.level === lvl).forEach((d) => {
        const b = document.createElement("button");
        b.setAttribute("role", "option");
        b.setAttribute("aria-selected", String(d.id === cur.id));
        b.innerHTML = `<span>${esc(d.name)}</span><span class="bar" title="noise ceiling ${f2(d.ceiling)}"><span style="width:${(100 * d.ceiling).toFixed(0)}%"></span></span>`;
        b.addEventListener("click", () => go(`#descriptors/${d.id}`));
        list.appendChild(b);
      });
    });
    const det = $("#descriptor-detail");
    const measurable = cur.se_over_between !== null && cur.se_over_between < 1;
    const quad = {
      I: "well explained by MIDI, little disagreement", II: "well explained by MIDI, more disagreement",
      III: "weakly explained by MIDI, little disagreement", IV: "weakly explained by MIDI, more disagreement",
    }[cur.quadrant];
    det.innerHTML = `
      <div class="panel">
        <h2>${esc(cur.name)} <span class="pill">1 = ${esc(cur.low)} · 7 = ${esc(cur.high)}</span>
          <span class="pill">${cur.level === "low" ? "sound / execution" : "musical / affective"}</span>
          <span class="pill">quadrant ${esc(cur.quadrant)}: ${esc(quad)}</span></h2>
        <div class="kv">
          <div><b>${f2(cur.ceiling)}</b><span>noise ceiling: share of between-pianist differences that is not rating noise</span></div>
          <div><b>${f2(cur.r2)}</b><span>R² from 21 MIDI features [${f2(cur.r2_ci[0])}, ${f2(cur.r2_ci[1])}]</span></div>
          <div><b>${cur.share === null ? "–" : fpct(cur.share)}</b><span>of the ceiling reached${cur.ceiling < 0.25 ? " (very uncertain: low ceiling)" : ""}</span></div>
          <div><b>${f2(cur.disagreement)}</b><span>relative disagreement between raters (lower = more agreement)</span></div>
        </div>
        <p class="sub">Single segments ${measurable ? "<b>can</b>" : "<b>cannot</b>"} be compared reliably on this scale:
          the error of one segment's mean (about ${cur.median_raters} raters) is ${f2(cur.se_over_between)} times the typical
          true difference between pianists.</p>
      </div>
      <div class="grid-2">
        <div class="panel"><h2>Explained by each feature group alone</h2>
          <p class="sub">Out-of-fold R² with only that group of MIDI features (leave one pianist out).</p>
          <div id="chart-groups" class="chart"></div></div>
        <div class="panel"><h2>Most related performance features</h2>
          <p class="sub">Correlation with the rater-adjusted score across pianists of the same passage.</p>
          <div id="chart-related" class="chart"></div></div>
      </div>
      <div class="panel"><h2>Clearest contrasts</h2>
        <p class="sub">Pairs of pianists in the same passage whose scores on this scale differ most, after accounting for
          rating noise (in units of the typical difference between two pianists). Open one to see and hear the playing.</p>
        <ul class="examples">${cur.contrasts.map((c) => `<li><a href="#compare/${encodeURIComponent(c.a)}/${encodeURIComponent(c.b)}">${esc(passageOf(c.a).name)}: ${esc(pianist(c.a))} (towards ${esc(cur.high)}) vs. ${esc(pianist(c.b))}</a> <span class="note">difference ${f2(c.diff)}</span></li>`).join("")}</ul>
      </div>`;
    drawBars($("#chart-groups"), Object.entries(cur.groups).map(([g, v]) => ({ label: GROUP_NAME[g] || g, v, color: C.blue,
      tip: `${GROUP_NAME[g] || g}: R² ${fs2(v)}` })), { domain: [Math.min(-0.05, d3.min(Object.values(cur.groups))), Math.max(0.3, d3.max(Object.values(cur.groups)))], fmt: f2 });
    drawBars($("#chart-related"), cur.related.map((r) => {
      const f = FEAT[FIDX[r.f]];
      return { label: f.name, v: r.r, color: ROLE_COLOR[f.role], tip: `${f.name}: r = ${fs2(r.r)}` };
    }), { domain: [-0.6, 0.6], fmt: fs2 });
  }

  function drawBars(node, rows, { domain, fmt }) {
    const W = width(node, 280), m = { t: 6, r: 44, b: 26, l: 180 }, rowH = 24;
    const H = m.t + m.b + rows.length * rowH;
    const x = d3.scaleLinear().domain(domain).nice().range([m.l, W - m.r]);
    const y = d3.scaleBand().domain(rows.map((d, i) => i)).range([m.t, H - m.b]).padding(0.28);
    node.innerHTML = "";
    const svg = d3.select(node).append("svg").attr("width", W).attr("height", H);
    const nt = Math.max(2, Math.floor((W - m.l - m.r) / 70));
    svg.append("g").attr("class", "gridline").attr("transform", `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).ticks(nt).tickSize(-(H - m.t - m.b)).tickFormat(""));
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).ticks(nt));
    svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", m.t).attr("y2", H - m.b).attr("stroke", C.axis);
    const g = svg.append("g").selectAll("g").data(rows).join("g").attr("transform", (d, i) => `translate(0,${y(i)})`)
      .on("mousemove", (ev, d) => tip.show(esc(d.tip), ev)).on("mouseleave", tip.hide);
    g.append("text").attr("x", m.l - 10).attr("y", y.bandwidth() / 2 + 4).attr("text-anchor", "end")
      .attr("class", "lbl-text").style("fill", C.ink).text((d) => d.label);
    g.append("rect").attr("x", (d) => x(Math.min(0, d.v))).attr("width", (d) => Math.abs(x(d.v) - x(0)))
      .attr("height", y.bandwidth()).attr("rx", 3).attr("fill", (d) => d.color);
    g.append("text").attr("x", (d) => (d.v >= 0 ? x(d.v) + 5 : x(0) + 5)).attr("y", y.bandwidth() / 2 + 4)
      .attr("text-anchor", "start").attr("class", "lbl-text").text((d) => fmt(d.v));
  }

  const selected = [];
  function fillPassageSelect(sel, current) {
    sel.innerHTML = "";
    d3.groups(PASS.map((p, i) => ({ p, i })), (d) => d.p.work).forEach(([work, items]) => {
      const og = document.createElement("optgroup");
      og.label = work.replace(/_/g, " ");
      items.forEach(({ p, i }) => {
        const o = document.createElement("option");
        o.value = i;
        o.textContent = `${p.name} (${p.keys.length})`;
        if (i === current) o.selected = true;
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
  }

  function renderPassages(idx) {
    let i = Number.isFinite(+idx) && PASS[+idx] ? +idx : PASS.findIndex((p) => p.keys.includes(D.cases[0].a));
    if (i < 0) i = 0;
    const sel = $("#passage-select");
    fillPassageSelect(sel, i);
    sel.onchange = () => { selected.length = 0; go(`#passages/${sel.value}`); };
    const p = PASS[i];
    $("#passage-title").textContent = `${p.name} · ${p.keys.length} performances`;
    selected.splice(0, selected.length, ...selected.filter((k) => p.keys.includes(k)));
    const btn = $("#passage-compare");
    const refreshBtn = () => {
      btn.disabled = selected.length !== 2;
      btn.classList.toggle("primary", selected.length === 2);
      $("#passage-hint").textContent = selected.length === 2 ? `${pianist(selected[0])} vs. ${pianist(selected[1])}`
        : "Click two performances, then compare them.";
    };
    btn.onclick = () => { if (selected.length === 2) go(`#compare/${selected[0]}/${selected[1]}`); };
    drawPassageHeatmap($("#chart-passage"), p, refreshBtn);
    refreshBtn();
  }

  function drawPassageHeatmap(node, p, onSelect) {
    const keys = p.keys;
    const feats = PASSAGE_FEATURES.map((id) => FEAT[FIDX[id]]);
    const cols = [...DESC.map((d) => ({ kind: "d", d })), { kind: "gap" }, ...feats.map((f) => ({ kind: "f", f }))];
    const W0 = width(node, 640), m = { t: 128, r: 90, b: 52, l: 92 };
    const cellW = Math.max(22, Math.min(40, Math.floor((W0 - m.l - m.r) / (cols.length - 0.6))));
    const colX = []; let xx = m.l;
    cols.forEach((c) => { colX.push(xx); xx += c.kind === "gap" ? cellW * 0.4 : cellW; });
    const W = xx + m.r, rowH = 24, H = m.t + m.b + keys.length * rowH;
    const means = DESC.map((d, i) => d3.mean(keys, (k) => SEG[k].m[i]));
    const sdObs = DESC.map((d) => Math.sqrt(d.between_sd ** 2 + d.resid_sd ** 2 / d.median_raters));
    node.innerHTML = "";
    const svg = d3.select(node).append("svg").attr("width", W).attr("height", H);
    cols.forEach((c, ci) => {
      if (c.kind === "gap") return;
      const label = c.kind === "d" ? c.d.name : (SHORT_FEATURE[c.f.id] || c.f.name);
      svg.append("text").attr("transform", `translate(${colX[ci] + cellW / 2 + 4},${m.t - 8}) rotate(-55)`)
        .attr("class", "lbl-text").style("fill", c.kind === "f" && c.f.role === "candidate" ? C.ink : C.ink2)
        .style("font-weight", c.kind === "f" && c.f.role === "candidate" ? 700 : 400).text(label);
    });
    const row = svg.append("g").selectAll("g").data(keys).join("g")
      .attr("transform", (k, r) => `translate(0,${m.t + r * rowH})`).style("cursor", "pointer")
      .on("click", (ev, k) => {
        const j = selected.indexOf(k);
        if (j >= 0) selected.splice(j, 1); else { selected.push(k); if (selected.length > 2) selected.shift(); }
        row.select("rect.sel").attr("stroke", (kk) => (selected.includes(kk) ? C.ink : "none"));
        onSelect();
      });
    row.append("rect").attr("class", "sel").attr("x", 2).attr("y", 1).attr("width", W - 4).attr("height", rowH - 2)
      .attr("rx", 4).attr("fill", "none").attr("stroke", (k) => (selected.includes(k) ? C.ink : "none")).attr("stroke-width", 1.5);
    row.append("text").attr("x", m.l - 10).attr("y", rowH / 2 + 4).attr("text-anchor", "end").attr("class", "lbl-text")
      .style("fill", C.ink).text((k) => pianist(k));
    cols.forEach((c, ci) => {
      if (c.kind === "gap") return;
      row.append("rect").attr("x", colX[ci] + 1).attr("y", 3).attr("width", cellW - 2).attr("height", rowH - 6).attr("rx", 3)
        .attr("fill", (k) => {
          if (c.kind === "d") return DIV((SEG[k].m[c.d.index] - means[c.d.index]) / sdObs[c.d.index]);
          const z = featZ(k, c.f.id);
          return z === null ? "#fff" : DIV(z);
        })
        .on("mousemove", (ev, k) => {
          if (c.kind === "d") {
            const i = c.d.index, s = SEG[k];
            const se = c.d.resid_sd / Math.sqrt(s.k[i]);
            tip.show(`<div class="t">${esc(pianist(k))} · ${esc(c.d.name)}</div>
              Score ${f2(s.m[i])} ± ${f2(1.96 * se)} (${s.k[i]} raters)<br>Passage average ${f2(means[i])}
              <br><span class="m">1 = ${esc(c.d.low)}, 7 = ${esc(c.d.high)}</span>`, ev);
          } else {
            const z = featZ(k, c.f.id);
            tip.show(`<div class="t">${esc(pianist(k))} · ${esc(c.f.name)}</div>${esc(fmtFeature(c.f.id, featValue(k, c.f.id)))}
              <br>${z === null ? "" : `${fs2(z)} SD from the passage average`}`, ev);
          }
        })
        .on("mouseleave", tip.hide);
    });
    const lab = svg.append("g").attr("transform", `translate(${m.l},14)`);
    lab.append("text").attr("class", "lbl-text").attr("y", 0).text("Descriptor scores");
    lab.append("text").attr("class", "lbl-text").attr("x", colX[DESC.length + 1] - m.l).attr("y", 0).text("Selected features");
    const lw = 180, ly = H - m.b + 18;
    const gid = `div-grad-${Math.random().toString(36).slice(2, 8)}`;
    const grad = svg.append("defs").append("linearGradient").attr("id", gid);
    [-2, -1, 0, 1, 2].forEach((v) => grad.append("stop").attr("offset", `${(v + 2) * 25}%`).attr("stop-color", DIV(v)));
    const leg = svg.append("g").attr("transform", `translate(${m.l},${ly})`);
    leg.append("rect").attr("width", lw).attr("height", 10).attr("rx", 2).attr("fill", `url(#${gid})`);
    [["−2 SD", 0, "start"], ["passage average", lw / 2, "middle"], ["+2 SD", lw, "end"]].forEach(([t, xx, an]) =>
      leg.append("text").attr("x", xx).attr("y", 24).attr("text-anchor", an).attr("class", "lbl-text").text(t));
    leg.append("text").attr("x", lw + 14).attr("y", 9).attr("class", "lbl-text")
      .text("blue: towards the low end of the scale (or below average); orange: towards the high end");
  }

  function exampleOptions(sel, a, b) {
    sel.innerHTML = '<option value="">Choose an example…</option>';
    const fname = (id) => FEAT[FIDX[id]].name;
    d3.groups(D.cases, (c) => c.feature).forEach(([feat, cs]) => {
      const og = document.createElement("optgroup");
      og.label = `Rated alike, different ${fname(feat).toLowerCase()}`;
      cs.forEach((c) => {
        const o = new Option(`${passageOf(c.a).name}: ${pianist(c.a)} vs. ${pianist(c.b)}`, `${c.a}|${c.b}`);
        o.selected = c.a === a && c.b === b;
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
    const og = document.createElement("optgroup");
    og.label = "Clearest contrast on one descriptor";
    DESC.forEach((d) => {
      const c = d.contrasts[0];
      const o = new Option(`${d.name}: ${passageOf(c.a).name}, ${pianist(c.a)} vs. ${pianist(c.b)}`, `${c.a}|${c.b}`);
      o.selected = !sel.value && c.a === a && c.b === b;
      og.appendChild(o);
    });
    sel.appendChild(og);
  }

  function renderCompare(a, b) {
    if (!SEG[a] || !SEG[b] || a === b || SEG[a].p !== SEG[b].p) {
      const c = D.cases.find((k) => k.feature === "soft_pedal_ratio" && k.rank === 1) || D.cases[0];
      if (SEG[a] && !SEG[b]) {
        const other = passageOf(a).keys.find((k) => k !== a);
        return go(`#compare/${a}/${other}`);
      }
      return go(`#compare/${c.a}/${c.b}`);
    }
    const p = passageOf(a), pi = SEG[a].p;
    const ps = $("#cmp-passage");
    fillPassageSelect(ps, pi);
    ps.onchange = () => { const k = PASS[+ps.value].keys; go(`#compare/${k[0]}/${k[1]}`); };
    const fillPianists = (sel, val, other) => {
      sel.innerHTML = "";
      p.keys.forEach((k) => { const o = new Option(pianist(k), k); o.selected = k === val; o.disabled = k === other; sel.appendChild(o); });
    };
    fillPianists($("#cmp-a"), a, b);
    fillPianists($("#cmp-b"), b, a);
    $("#cmp-a").onchange = (e) => go(`#compare/${e.target.value}/${b}`);
    $("#cmp-b").onchange = (e) => go(`#compare/${a}/${e.target.value}`);
    const ex = $("#cmp-examples");
    exampleOptions(ex, a, b);
    ex.onchange = () => { if (ex.value) { const [x, y] = ex.value.split("|"); go(`#compare/${x}/${y}`); } };

    const cmp = comparePair(a, b);
    const pct = percentileBelow(cmp.Q);
    const alike = cmp.Q <= D.meta.alike_threshold;
    const diffs = FEAT.map((f) => ({ f, dz: (featZ(a, f.id) ?? NaN) - (featZ(b, f.id) ?? NaN) }))
      .filter((d) => Number.isFinite(d.dz)).sort((x, y) => Math.abs(y.dz) - Math.abs(x.dz));
    const minK = d3.min(cmp.rows, (r) => Math.min(r.ka, r.kb));
    $("#cmp-summary").innerHTML = `
      <div><div class="lbl">Passage</div><div><b>${esc(p.name)}</b></div></div>
      <div><div class="lbl">A vs. B</div><div><b>${esc(pianist(a))}</b> vs. <b>${esc(pianist(b))}</b></div></div>
      <div><div class="lbl">Rating distance (1 = a typical pair)</div><div class="big">${f2(cmp.Q)}</div></div>
      <div><div class="lbl">Compared with all ${fint(D.meta.n_pairs)} same-passage pairs</div>
        <div><b>${alike ? "rated alike: " : ""}more alike than ${fpct(1 - pct)}</b></div></div>
      <div><div class="lbl">Largest playing difference</div><div><b>${esc(diffs[0].f.name)}</b> (${f2(Math.abs(diffs[0].dz))} SD)</div></div>
      <div><div class="lbl">Raters per segment</div><div>at least ${minK}</div></div>`;
    drawRatingDiffs($("#chart-cmp-ratings"), cmp.rows, a, b);
    drawFeatureDiffs($("#chart-cmp-features"), diffs.slice(0, 12), a, b);
    drawRolls(a, b);
  }

  function drawRatingDiffs(node, rows, a, b) {
    const W = width(node, 300), m = { t: 8, r: 16, b: 34, l: 150 }, rowH = 20;
    const H = m.t + m.b + rows.length * rowH;
    const lim = Math.max(3, Math.ceil(d3.max(rows, (r) => Math.abs(r.std) + r.ci)));
    const x = d3.scaleLinear().domain([-lim, lim]).range([m.l, W - m.r]);
    const y = d3.scaleBand().domain(rows.map((r) => r.d.id)).range([m.t, H - m.b]).padding(0.3);
    node.innerHTML = "";
    const svg = d3.select(node).append("svg").attr("width", W).attr("height", H);
    svg.append("rect").attr("x", x(-1)).attr("width", x(1) - x(-1)).attr("y", m.t).attr("height", H - m.t - m.b).attr("fill", C.band);
    const nt = Math.max(3, Math.min(7, Math.floor((W - m.l - m.r) / 45)));
    svg.append("g").attr("class", "gridline").attr("transform", `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).ticks(nt).tickSize(-(H - m.t - m.b)).tickFormat(""));
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(nt));
    svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", m.t).attr("y2", H - m.b).attr("stroke", C.axis);
    svg.append("text").attr("x", x(-lim) + 2).attr("y", H - 4).attr("class", "lbl-text").text(`← B higher`);
    svg.append("text").attr("x", x(lim) - 2).attr("y", H - 4).attr("text-anchor", "end").attr("class", "lbl-text").text(`A higher →`);
    const g = svg.append("g").selectAll("g").data(rows).join("g")
      .attr("transform", (r) => `translate(0,${y(r.d.id) + y.bandwidth() / 2})`)
      .on("mousemove", (ev, r) => tip.show(`<div class="t">${esc(r.d.name)} <span class="m">(1 = ${esc(r.d.low)}, 7 = ${esc(r.d.high)})</span></div>
        ${esc(pianist(a))}: ${f2(r.ma)} (${r.ka} raters)<br>${esc(pianist(b))}: ${f2(r.mb)} (${r.kb} raters)<br>
        Difference ${fs2(r.std)} ± ${f2(r.ci)} typical units${r.noisy ? '<br><span class="m">Too few raters to compare single segments on this scale</span>' : ""}`, ev))
      .on("mouseleave", tip.hide);
    g.append("rect").attr("x", 0).attr("y", -rowH / 2).attr("width", W).attr("height", rowH).attr("fill", "transparent");
    g.append("text").attr("x", m.l - 10).attr("y", 4).attr("text-anchor", "end").attr("class", "lbl-text")
      .style("fill", (r) => (r.noisy ? C.muted : C.ink)).text((r) => r.d.name);
    g.append("line").attr("x1", (r) => x(Math.max(-lim, r.std - r.ci))).attr("x2", (r) => x(Math.min(lim, r.std + r.ci)))
      .attr("stroke", (r) => (r.noisy ? C.gray : C.ink2)).attr("stroke-width", 2).attr("stroke-linecap", "round");
    g.append("circle").attr("cx", (r) => x(r.std)).attr("r", 4.5).attr("fill", (r) => (r.noisy ? C.gray : C.ink))
      .attr("stroke", "#fff").attr("stroke-width", 1.2);
  }

  function drawFeatureDiffs(node, rows, a, b) {
    const W = width(node, 300), m = { t: 6, r: 44, b: 30, l: 200 }, rowH = 22;
    const H = m.t + m.b + rows.length * rowH;
    const lim = Math.max(2.5, Math.ceil(d3.max(rows, (r) => Math.abs(r.dz))));
    const x = d3.scaleLinear().domain([-lim, lim]).range([m.l, W - m.r]);
    const y = d3.scaleBand().domain(rows.map((r) => r.f.id)).range([m.t, H - m.b]).padding(0.28);
    node.innerHTML = "";
    const svg = d3.select(node).append("svg").attr("width", W).attr("height", H);
    const nt = Math.max(3, Math.min(7, Math.floor((W - m.l - m.r) / 45)));
    svg.append("g").attr("class", "gridline").attr("transform", `translate(0,${H - m.b})`)
      .call(d3.axisBottom(x).ticks(nt).tickSize(-(H - m.t - m.b)).tickFormat(""));
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(nt));
    svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", m.t).attr("y2", H - m.b).attr("stroke", C.axis);
    const g = svg.append("g").selectAll("g").data(rows).join("g").attr("transform", (r) => `translate(0,${y(r.f.id)})`)
      .on("mousemove", (ev, r) => tip.show(`<div class="t">${esc(r.f.name)}</div>
        ${esc(pianist(a))}: ${esc(fmtFeature(r.f.id, featValue(a, r.f.id)))}<br>
        ${esc(pianist(b))}: ${esc(fmtFeature(r.f.id, featValue(b, r.f.id)))}<br>Difference ${fs2(r.dz)} SD`, ev))
      .on("mouseleave", tip.hide);
    g.append("text").attr("x", m.l - 10).attr("y", y.bandwidth() / 2 + 4).attr("text-anchor", "end").attr("class", "lbl-text")
      .style("fill", C.ink).style("font-weight", (r) => (r.f.role === "candidate" ? 700 : 400)).text((r) => r.f.name);
    g.append("rect").attr("x", (r) => x(Math.min(0, r.dz))).attr("width", (r) => Math.abs(x(r.dz) - x(0)))
      .attr("height", y.bandwidth()).attr("rx", 3).attr("fill", (r) => ROLE_COLOR[r.f.role]);
    g.append("text").attr("x", (r) => (r.dz >= 0 ? x(r.dz) + 5 : x(0) + 5)).attr("y", y.bandwidth() / 2 + 4)
      .attr("text-anchor", "start").attr("class", "lbl-text").text((r) => fs2(r.dz));
  }

  const MidiClass = () => (window.Midi && (window.Midi.Midi || window.Midi)) || null;

  async function loadMidi(key) {
    if (midiCache.has(key)) return midiCache.get(key);
    const pr = (async () => {
      const M = MidiClass();
      if (!M) throw new Error("MIDI parser did not load");
      const res = await fetch(D.meta.midi_base + encodeURIComponent(SEG[key].midi));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const midi = new M(await res.arrayBuffer());
      const notes = [], cc = { 64: [], 67: [] };
      midi.tracks.forEach((t) => {
        t.notes.forEach((n) => notes.push({ t: n.time, d: n.duration, p: n.midi, v: Math.round(n.velocity * 127) }));
        [64, 67].forEach((num) => (t.controlChanges[num] || []).forEach((c) => cc[num].push({ t: c.time, v: c.value * 127 })));
      });
      notes.sort((x, y) => x.t - y.t);
      const t0 = d3.min(notes, (n) => n.t), t1 = d3.max(notes, (n) => n.t + n.d);
      const steps = (ev) => {
        ev.sort((x, y) => x.t - y.t);
        let v = 0; const out = [];
        ev.forEach((e) => { if (e.t <= t0) v = e.v; });
        out.push({ t: 0, v });
        ev.forEach((e) => { if (e.t > t0 && e.t < t1) out.push({ t: e.t - t0, v: e.v }); });
        out.push({ t: t1 - t0, v: out[out.length - 1].v });
        return out;
      };
      return { notes: notes.map((n) => ({ ...n, t: n.t - t0 })), cc64: steps(cc[64]), cc67: steps(cc[67]), dur: t1 - t0 };
    })();
    midiCache.set(key, pr);
    pr.catch(() => midiCache.delete(key));
    return pr;
  }

  let rollToken = 0;
  async function drawRolls(a, b) {
    const token = ++rollToken;
    player.stop();
    const boxes = [["#roll-a", a, "A"], ["#roll-b", b, "B"]];
    boxes.forEach(([sel, key, tag]) => {
      $(sel).innerHTML = `<div class="head"><b>${tag} · ${esc(pianist(key))} · soft pedal down ${fpct(featValue(key, "soft_pedal_ratio"))} of the time · sustain down ${fpct(featValue(key, "pedal_coverage_ratio"))}</b>
        <span><button data-play="${esc(key)}" disabled>▶ Play</button></span></div><div class="status">Loading MIDI…</div>`;
    });
    let parsed;
    try {
      parsed = await Promise.all([loadMidi(a), loadMidi(b)]);
    } catch (e) {
      if (token !== rollToken) return;
      boxes.forEach(([sel]) => { $(`${sel} .status`).textContent = `Could not load the MIDI file from the PercePiano repository (${e.message}).`; });
      return;
    }
    if (token !== rollToken) return;
    const dur = d3.max(parsed, (p) => p.dur);
    const all = parsed.flatMap((p) => p.notes);
    const pr = [d3.min(all, (n) => n.p) - 2, d3.max(all, (n) => n.p) + 2];
    boxes.forEach(([sel, key], i) => {
      const box = $(sel);
      box.querySelector(".status").remove();
      const holder = document.createElement("div");
      box.appendChild(holder);
      drawRoll(holder, parsed[i], dur, pr);
      const btn = box.querySelector("button[data-play]");
      btn.disabled = !window.Tone;
      if (!window.Tone) btn.title = "Audio library did not load";
      btn.onclick = () => player.toggle(key, parsed[i], holder, btn);
    });
  }

  function drawRoll(node, mid, dur, pitchRange) {
    const W = width(node, 300), m = { t: 4, r: 8, b: 22, l: 34 }, hRoll = 150, hPed = 44, gap = 8;
    const H = m.t + hRoll + gap + hPed + m.b;
    const x = d3.scaleLinear().domain([0, dur]).range([m.l, W - m.r]);
    const y = d3.scaleLinear().domain(pitchRange).range([m.t + hRoll, m.t]);
    const yp = d3.scaleLinear().domain([0, 127]).range([m.t + hRoll + gap + hPed, m.t + hRoll + gap]);
    const svg = d3.select(node).append("svg").attr("width", W).attr("height", H);
    svg.append("g").attr("class", "gridline").attr("transform", `translate(${m.l},0)`)
      .call(d3.axisLeft(y).ticks(4).tickSize(-(W - m.l - m.r)).tickFormat(""));
    svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSize(3));
    const nh = Math.max(2, Math.abs(y(0) - y(1)) * 0.8);
    svg.append("g").selectAll("rect").data(mid.notes).join("rect")
      .attr("x", (n) => x(n.t)).attr("y", (n) => y(n.p) - nh / 2).attr("width", (n) => Math.max(1.5, x(n.t + n.d) - x(n.t)))
      .attr("height", nh).attr("rx", 1).attr("fill", (n) => VEL(n.v));
    svg.append("rect").attr("x", m.l).attr("y", m.t + hRoll + gap).attr("width", W - m.l - m.r).attr("height", hPed).attr("fill", "#faf9f6");
    const line = d3.line().x((d) => x(d.t)).y((d) => yp(d.v)).curve(d3.curveStepAfter);
    svg.append("path").datum(mid.cc64).attr("d", line).attr("fill", "none").attr("stroke", C.blue).attr("stroke-width", 1.5);
    svg.append("path").datum(mid.cc67).attr("d", line).attr("fill", "none").attr("stroke", C.orange).attr("stroke-width", 1.5);
    svg.append("text").attr("x", m.l - 4).attr("y", yp(127) + 8).attr("text-anchor", "end").attr("class", "lbl-text").text("down");
    svg.append("text").attr("x", m.l - 4).attr("y", yp(0)).attr("text-anchor", "end").attr("class", "lbl-text").text("up");
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(6).tickFormat((t) => `${t}s`));
    svg.append("line").attr("class", "playhead").attr("x1", x(0)).attr("x2", x(0)).attr("y1", m.t).attr("y2", H - m.b)
      .attr("stroke", C.ink).attr("stroke-width", 1.5).attr("visibility", "hidden");
    node.__x = x;
  }

  const player = {
    sampler: null, ready: null, key: null, btn: null, raf: 0, stopEv: null,
    async ensure() {
      if (!this.ready) {
        this.sampler = new Tone.Sampler({
          urls: { A0: "A0.mp3", C1: "C1.mp3", "D#1": "Ds1.mp3", "F#1": "Fs1.mp3", A1: "A1.mp3", C2: "C2.mp3",
            "D#2": "Ds2.mp3", "F#2": "Fs2.mp3", A2: "A2.mp3", C3: "C3.mp3", "D#3": "Ds3.mp3", "F#3": "Fs3.mp3",
            A3: "A3.mp3", C4: "C4.mp3", "D#4": "Ds4.mp3", "F#4": "Fs4.mp3", A4: "A4.mp3", C5: "C5.mp3",
            "D#5": "Ds5.mp3", "F#5": "Fs5.mp3", A5: "A5.mp3", C6: "C6.mp3", "D#6": "Ds6.mp3", "F#6": "Fs6.mp3",
            A6: "A6.mp3", C7: "C7.mp3", "D#7": "Ds7.mp3", "F#7": "Fs7.mp3", A7: "A7.mp3", C8: "C8.mp3" },
          release: 1, baseUrl: "https://tonejs.github.io/audio/salamander/",
        }).toDestination();
        this.ready = Tone.loaded();
      }
      return this.ready;
    },
    events(mid) {
      const ped = mid.cc64;
      const downAt = (t) => { let v = 0; for (const e of ped) { if (e.t <= t) v = e.v; else break; } return v >= 64; };
      const nextUp = (t) => { for (const e of ped) if (e.t > t && e.v < 64) return e.t; return mid.dur + 1; };
      return mid.notes.map((n) => {
        const end = n.t + n.d;
        const rel = downAt(end) ? Math.min(nextUp(end), end + 8) : end;
        return { t: n.t, dur: Math.max(0.05, rel - n.t), note: Tone.Frequency(n.p, "midi").toNote(), vel: Math.max(0.05, n.v / 127) };
      });
    },
    async toggle(key, mid, holder, btn) {
      if (this.key === key) { this.stop(); return; }
      this.stop();
      btn.textContent = "Loading piano…";
      try {
        await Tone.start();
        await this.ensure();
      } catch (e) {
        btn.textContent = "▶ Play";
        btn.title = `Audio unavailable: ${e.message}`;
        return;
      }
      const T = Tone.Transport;
      T.cancel(); T.stop(); T.seconds = 0;
      this.events(mid).forEach((ev) => T.schedule((time) => this.sampler.triggerAttackRelease(ev.note, ev.dur, time, ev.vel), ev.t));
      this.stopEv = T.schedule(() => Tone.Draw.schedule(() => this.stop(), Tone.now()), mid.dur + 1.2);
      this.key = key; this.btn = btn; btn.textContent = "■ Stop";
      const head = d3.select(holder).select(".playhead").attr("visibility", "visible");
      const x = holder.__x;
      const tick = () => {
        head.attr("x1", x(Math.min(T.seconds, mid.dur))).attr("x2", x(Math.min(T.seconds, mid.dur)));
        this.raf = requestAnimationFrame(tick);
      };
      T.start("+0.05");
      tick();
    },
    stop() {
      if (!window.Tone) return;
      cancelAnimationFrame(this.raf);
      Tone.Transport.stop(); Tone.Transport.cancel();
      if (this.sampler) this.sampler.releaseAll();
      if (this.btn) this.btn.textContent = "▶ Play";
      d3.selectAll(".playhead").attr("visibility", "hidden");
      this.key = null; this.btn = null;
    },
  };

  const RATE_STORE = "bw-explorer-ratings-v1";
  const rv = { data: null, pending: null, key: null, mid: null, error: null, answers: {}, revealed: false, token: 0, history: [] };
  const rateStore = {
    load() { try { const v = JSON.parse(localStorage.getItem(RATE_STORE) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } },
    save(h) { try { localStorage.setItem(RATE_STORE, JSON.stringify(h)); } catch (e) {  } },
    clear() { try { localStorage.removeItem(RATE_STORE); } catch (e) {  } },
  };

  function rateData() {
    if (!rv.pending) {
      const fallback = () => ({ scales: ["mm_tempo", "timing", "pedal_amount", "interpretation"]
        .map((id) => ({ id, leniency_sd: 0, error_sd: DESC[DIDX[id]].resid_sd })), duration_s: {} });
      rv.pending = fetch("data/rate.json").then((r) => (r.ok ? r.json() : fallback())).catch(fallback);
    }
    return rv.pending;
  }
  function rateCandidates() {
    const idx = rv.data.scales.map((s) => DIDX[s.id]);
    return Object.keys(SEG).filter((k) => {
      const seg = SEG[k], dur = rv.data.duration_s[k];
      return !seg.score && idx.every((i) => seg.k[i] >= 5 && Number.isFinite(seg.m[i]))
        && (dur === undefined || (dur >= 6 && dur <= 35));
    });
  }
  function ratePick() {
    const all = rateCandidates().filter((k) => k !== rv.key);
    const done = new Set(rv.history.map((h) => h.key));
    const fresh = all.filter((k) => !done.has(k));
    const pool = fresh.length ? fresh : all;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function rateStart(key) {
    player.stop();
    Object.assign(rv, { key, mid: null, error: null, answers: {}, revealed: false });
    const token = ++rv.token;
    loadMidi(key).then((mid) => { if (token === rv.token) { rv.mid = mid; drawRate(); } })
      .catch((e) => { if (token === rv.token) { rv.error = e.message; drawRate(); } });
  }
  async function renderRate(k) {
    if (!rv.data) {
      const data = await rateData();
      if (!rv.data) {
        rv.data = data;
        rv.history = rateStore.load().filter((h) => h && SEG[h.key] && h.answers
          && data.scales.every((s) => Number.isFinite(h.answers[s.id])));
      }
    }
    if (k && SEG[k] && !SEG[k].score && k !== rv.key) rateStart(k);
    else if (!rv.key) rateStart(ratePick());
    drawRate();
  }

  function drawRate() {
    const R = rv.data, key = rv.key;
    if (!R || !key) return;
    $("#rate-passage").innerHTML = `<b>${esc(passageOf(key).name)}</b>${rv.revealed ? ` · ${esc(pianist(key))}` : ""}`;

    const playBtn = $("#rate-play"), holder = $("#rate-progress");
    if (!(player.key === key && player.btn === playBtn)) {
      holder.innerHTML = "";
      playBtn.textContent = "▶ Play";
      if (rv.mid) {
        const W = width(holder, 260);
        const svg = d3.select(holder).append("svg").attr("width", W).attr("height", 22);
        svg.append("line").attr("x1", 8).attr("x2", W - 8).attr("y1", 11).attr("y2", 11)
          .attr("stroke", C.grid).attr("stroke-width", 4).attr("stroke-linecap", "round");
        svg.append("line").attr("class", "playhead").attr("x1", 8).attr("x2", 8).attr("y1", 3).attr("y2", 19)
          .attr("stroke", C.ink).attr("stroke-width", 2).attr("visibility", "hidden");
        holder.__x = d3.scaleLinear().domain([0, rv.mid.dur]).range([8, W - 8]);
      }
    }
    playBtn.disabled = !rv.mid || !window.Tone;
    playBtn.title = window.Tone ? "" : "Audio library did not load";
    playBtn.onclick = () => player.toggle(key, rv.mid, holder, playBtn);
    $("#rate-status").textContent = rv.error
      ? `Could not load the MIDI file from the PercePiano repository (${rv.error}).`
      : (rv.mid ? `${d3.format(".0f")(rv.mid.dur)} seconds. Listen as often as you like.` : "Loading MIDI…");
    $("#rate-next").onclick = () => { rateStart(ratePick()); go("#rate"); };

    const form = $("#rate-form");
    form.innerHTML = R.scales.map((s) => {
      const d = DESC[DIDX[s.id]];
      const options = d3.range(1, 8).map((v) => `<label><input type="radio" name="rate-${esc(s.id)}" value="${v}"${
        rv.answers[s.id] === v ? " checked" : ""}${rv.revealed ? " disabled" : ""}><span>${v}</span></label>`).join("");
      return `<fieldset class="rate-scale"><legend>${esc(d.name)}</legend>
        <div class="rate-ends"><span>1 = ${esc(d.low)}</span><span>7 = ${esc(d.high)}</span></div>
        <div class="rate-options">${options}</div></fieldset>`;
    }).join("");
    const reveal = $("#rate-reveal"), hint = $("#rate-hint");
    const update = () => {
      const left = R.scales.filter((s) => !Number.isFinite(rv.answers[s.id])).length;
      reveal.disabled = rv.revealed || left > 0;
      hint.textContent = rv.revealed || left === 0 ? "" : `${left} of ${R.scales.length} scales left`;
    };
    update();
    form.onchange = (ev) => {
      const t = ev.target;
      if (t && t.name && t.name.startsWith("rate-")) { rv.answers[t.name.slice(5)] = +t.value; update(); }
    };
    reveal.onclick = () => {
      rv.revealed = true;
      rv.history = rv.history.filter((h) => h.key !== key).concat({ key, answers: { ...rv.answers }, t: Date.now() });
      rateStore.save(rv.history);
      drawRate();
      $("#rate-result").scrollIntoView({ block: "nearest" });
    };

    const result = $("#rate-result");
    result.hidden = !rv.revealed;
    if (rv.revealed) {
      const seg = SEG[key];
      $("#rate-result-sub").textContent = `${passageOf(key).name}, ${pianist(key)}. Every scale runs from 1 to 7.`;
      const rows = $("#rate-rows");
      rows.innerHTML = "";
      R.scales.forEach((s) => {
        const i = DIDX[s.id], d = DESC[i], you = rv.answers[s.id];
        const row = document.createElement("div");
        row.className = "rate-row";
        row.innerHTML = `<div><div class="name">${esc(d.name)}</div><div class="vals">1 = ${esc(d.low)} · 7 = ${esc(d.high)}</div>
          <div class="vals">You <b>${you}</b> · experts <b>${f1(seg.m[i])}</b> (${seg.k[i]} raters)</div></div><div class="chart"></div>`;
        rows.appendChild(row);
        drawRateRow(row.querySelector(".chart"), s, d, you, seg.m[i], seg.k[i]);
      });
      const roll = $("#rate-roll");
      roll.innerHTML = `<div class="head"><b>${esc(pianist(key))} · soft pedal down ${fpct(featValue(key, "soft_pedal_ratio"))} of the time · sustain down ${fpct(featValue(key, "pedal_coverage_ratio"))}</b></div>`;
      if (rv.mid) {
        const h = document.createElement("div");
        roll.appendChild(h);
        drawRoll(h, rv.mid, rv.mid.dur, [d3.min(rv.mid.notes, (n) => n.p) - 2, d3.max(rv.mid.notes, (n) => n.p) + 2]);
      }
    }
    drawRateSession();
  }

  function drawRateRow(node, s, d, you, mean, k) {
    const W = width(node, 240), H = 62, cy = 30, pad = 16;
    const x = d3.scaleLinear().domain([1, 7]).range([pad, W - pad]);
    const clamp = (v) => Math.max(1, Math.min(7, v));
    const sd = Math.hypot(s.error_sd, s.leniency_sd), ci = 1.96 * s.error_sd / Math.sqrt(k);
    node.innerHTML = "";
    const svg = d3.select(node).append("svg").attr("width", W).attr("height", H)
      .on("mousemove", (ev) => tip.show(`<div class="t">${esc(d.name)}</div>You: ${you}<br>
        Experts' mean: ${f1(mean)} <span class="m">(95% CI ${f1(clamp(mean - ci))}–${f1(clamp(mean + ci))}, ${k} raters)</span><br>
        A single expert, ±1 SD: ${f1(clamp(mean - sd))}–${f1(clamp(mean + sd))}`, ev))
      .on("mouseleave", tip.hide);
    svg.append("rect").attr("x", x(clamp(mean - sd))).attr("width", x(clamp(mean + sd)) - x(clamp(mean - sd)))
      .attr("y", cy - 9).attr("height", 18).attr("rx", 4).attr("fill", C.band);
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${cy + 13})`)
      .call(d3.axisBottom(x).ticks(7).tickSize(3).tickFormat(d3.format("d")));
    svg.append("line").attr("x1", x(clamp(mean - ci))).attr("x2", x(clamp(mean + ci))).attr("y1", cy).attr("y2", cy)
      .attr("stroke", C.ink2).attr("stroke-width", 2).attr("stroke-linecap", "round");
    svg.append("circle").attr("cx", x(mean)).attr("cy", cy).attr("r", 4.5).attr("fill", C.ink)
      .attr("stroke", "#fff").attr("stroke-width", 1.2);
    const px = x(you), right = px < W - 60;
    svg.append("path").attr("d", `M${px - 6},${cy - 22}L${px + 6},${cy - 22}L${px},${cy - 12}Z`).attr("fill", C.blue);
    svg.append("text").attr("x", right ? px + 10 : px - 10).attr("y", cy - 13).attr("text-anchor", right ? "start" : "end")
      .attr("class", "lbl-text").style("fill", C.ink).style("font-weight", 700).text("You");
  }

  function drawRateSession() {
    const R = rv.data, H = rv.history, n = H.length;
    $("#rate-session").hidden = n === 0;
    if (!n) return;
    const typical = 0.798;
    const rows = R.scales.map((s) => {
      const i = DIDX[s.id];
      const diffs = H.map((h) => h.answers[s.id] - SEG[h.key].m[i]);
      const off = d3.mean(diffs);
      return { d: DESC[i], off, raw: d3.mean(diffs, Math.abs),
        adj: n >= 3 ? d3.mean(diffs, (v) => Math.abs(v - off)) * Math.sqrt(n / (n - 1)) : null,
        expertRaw: typical * Math.hypot(s.error_sd, s.leniency_sd), expertAdj: typical * s.error_sd };
    });
    $("#rate-session-sub").textContent = n >= 3
      ? `${n} performances rated. Your offset is how much higher or lower you rate than the experts on average: the same leniency that the analysis removes for every expert before pianists are compared. Distances are in scale points from the experts' mean.`
      : `${n} performance${n > 1 ? "s" : ""} rated. From three on, this table also estimates your own offset from the experts. Distances are in scale points from the experts' mean.`;
    $("#rate-summary").innerHTML = `<table class="validation-table"><thead><tr><th scope="col">Scale</th>
      <th scope="col">You − experts, on average</th><th scope="col">Your typical distance</th>
      <th scope="col">Same, your offset removed</th><th scope="col">A single expert: raw / leniency removed</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><th scope="row">${esc(r.d.name)}</th><td>${n >= 3 ? fs1(r.off) : "–"}</td>
        <td>${f1(r.raw)}</td><td>${r.adj === null ? "–" : f1(r.adj)}</td>
        <td>${f1(r.expertRaw)} / ${f1(r.expertAdj)}</td></tr>`).join("")}</tbody></table>`;
    $("#rate-reset").onclick = () => { rv.history = []; rateStore.clear(); drawRateSession(); };
  }

  async function boot() {
    try {
      const res = await fetch("data/explorer.json");
      D = await res.json();
    } catch (e) {
      $("#loading").textContent = `Could not load data/explorer.json (${e.message}). Serve this folder over HTTP.`;
      return;
    }
    DESC = D.descriptors.map((d, i) => ({ ...d, index: i }));
    DIDX = Object.fromEntries(DESC.map((d, i) => [d.id, i]));
    FEAT = D.features;
    FIDX = Object.fromEntries(D.meta.feature_ids.map((id, i) => [id, i]));
    SEG = D.segments;
    PASS = D.passages;
    $("#commit").textContent = D.meta.commit.slice(0, 7);
    $("#loading").remove();
    window.addEventListener("hashchange", route);
    let rt;
    window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(route, 200); });
    route();
  }
  boot();
})();
