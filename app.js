/* ============================================================
   STATE
   ============================================================ */
let milestones = JSON.parse(JSON.stringify(MILESTONES));
let tags = [...TAGS];
let tagColors = {};
tags.forEach((t, i) => { tagColors[t] = TAG_PALETTE[i % TAG_PALETTE.length]; });
let statuses = JSON.parse(JSON.stringify(INIT_STATUSES));
let zoom = 1, panX = 0;
let isPanning = false, panStartX = 0, panStartVal = 0;
let dragId = null, dragIsTask = false, dragDurationWeeks = 0, dragMoved = false;

// filters
let visibleTags = new Set([...tags, "__untagged__"]);
let visibleStatuses = new Set(statuses.map(s => s.key));

/* ID generator: nn-yyyymmdd */
function generateId() {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}`;
  const todayIds = milestones
    .filter(m => typeof m.id === "string" && m.id.endsWith("-" + dateStr))
    .map(m => parseInt(m.id.split("-")[0]) || 0);
  const seq = todayIds.length ? Math.max(...todayIds) + 1 : 1;
  return `${String(seq).padStart(2,"0")}-${dateStr}`;
}

/* helpers */
function getStatusColor(key) { const s = statuses.find(s => s.key === key); return s ? s.color : "#555"; }
function getStatusLabel(key) { const s = statuses.find(s => s.key === key); return s ? s.label : key; }
function getTagColor(tag) { return tagColors[tag] || "#555"; }

/* ============================================================
   WEEK HELPERS  (ISO-style: W1 contains Jan 4)
   ============================================================ */
function weekToTs(year, week) {
  const jan4 = new Date(year, 0, 4);
  const dow = jan4.getDay() || 7;
  const w1Mon = new Date(jan4);
  w1Mon.setDate(jan4.getDate() - dow + 1);
  const ts = new Date(w1Mon);
  ts.setDate(ts.getDate() + (week - 1) * 7);
  return ts.getTime();
}
function tsToWeek(ts) {
  const d = new Date(ts);
  const year = d.getFullYear();
  const w1 = weekToTs(year, 1);
  let week = Math.round((ts - w1) / (7 * 86400000)) + 1;
  if (week < 1) return { year: year - 1, week: 52 };
  if (week > 53) return { year: year + 1, week: 1 };
  return { year, week };
}
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function weekLabel(year, week) {
  const ts = weekToTs(year, week);
  const d = new Date(ts);
  return `W${week} \u00b7 ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function isTask(m) { return m.type === "task"; }
function msToTs(m) { return isTask(m) ? weekToTs(m.startYear, m.startWeek) : weekToTs(m.year, m.week); }
function msEndTs(m) { return isTask(m) ? weekToTs(m.endYear, m.endWeek) : msToTs(m); }
function effortWeeks(m) { if (!isTask(m)) return 0; return Math.max(1, Math.round((msEndTs(m) - msToTs(m)) / (7 * 86400000))); }
function sortedMs() { return [...milestones].sort((a, b) => msToTs(a) - msToTs(b)); }

/* ============================================================
   COORDINATES
   ============================================================ */
function msRange() {
  const s = sortedMs();
  let minTs = s.length ? msToTs(s[0]) : Date.now();
  let maxTs = s.length ? msToTs(s[s.length - 1]) : Date.now();
  // extend maxTs to include task end dates
  s.forEach(m => { const end = msEndTs(m); if (end > maxTs) maxTs = end; });
  const r = Math.max(maxTs - minTs, 86400000 * 60);
  return { min: minTs - r * 0.08, range: r * 1.16 };
}
const TRACK_BASE = 2400;
function trackW() { return TRACK_BASE * zoom; }
function tsToX(ts) { const r = msRange(); return ((ts - r.min) / r.range) * trackW(); }
function xToTs(x)  { const r = msRange(); return r.min + (x / trackW()) * r.range; }

/* ============================================================
   FILTER BAR
   ============================================================ */
const $filterBar = document.getElementById("filterBar");

function renderFilters() {
  $filterBar.innerHTML = "";

  // status filters
  const sg = document.createElement("div"); sg.className = "filter-group";
  const sl = document.createElement("span"); sl.className = "filter-label"; sl.textContent = "Status"; sg.appendChild(sl);
  statuses.forEach(st => {
    const pill = document.createElement("div");
    const active = visibleStatuses.has(st.key);
    pill.className = "filter-pill " + (active ? "active" : "inactive");
    pill.innerHTML = `<span class="pill-dot" style="background:${st.color}"></span>${st.label}`;
    pill.onclick = () => { if (active) visibleStatuses.delete(st.key); else visibleStatuses.add(st.key); renderFilters(); render(); };
    sg.appendChild(pill);
  });
  $filterBar.appendChild(sg);

  // tag filters
  const tg = document.createElement("div"); tg.className = "filter-group";
  const tl = document.createElement("span"); tl.className = "filter-label"; tl.textContent = "Tags"; tg.appendChild(tl);
  tags.forEach((tag, i) => {
    const pill = document.createElement("div");
    const active = visibleTags.has(tag);
    pill.className = "filter-pill " + (active ? "active" : "inactive");
    const tc = getTagColor(tag);
    pill.innerHTML = `<span class="pill-dot" style="background:${tc}"></span>${tag}`;
    pill.onclick = () => { if (active) visibleTags.delete(tag); else visibleTags.add(tag); renderFilters(); render(); };
    tg.appendChild(pill);
  });
  const hasUntagged = milestones.some(m => !m.tag);
  if (hasUntagged) {
    const pill = document.createElement("div");
    const active = visibleTags.has("__untagged__");
    pill.className = "filter-pill " + (active ? "active" : "inactive");
    pill.innerHTML = `<span class="pill-dot" style="background:#555"></span><em>Untagged</em>`;
    pill.onclick = () => { if (active) visibleTags.delete("__untagged__"); else visibleTags.add("__untagged__"); renderFilters(); render(); };
    tg.appendChild(pill);
  }
  $filterBar.appendChild(tg);
}

function isVisible(ms) {
  if (!visibleStatuses.has(ms.status)) return false;
  const t = ms.tag || "__untagged__";
  if (!visibleTags.has(t)) return false;
  return true;
}

/* ============================================================
   RENDER
   ============================================================ */
const $track = document.getElementById("track");
const $inner = document.getElementById("inner");
const $msCount = document.getElementById("msCount");
const $msList = document.getElementById("msListItems");

function render() {
  const s = sortedMs();
  const visible = s.filter(isVisible);
  const w = trackW();
  $inner.style.width = w + "px";
  $inner.style.left = panX + "px";

  $inner.querySelectorAll(".time-marker, .ms, .task-bar, .goal-connector, .goal-dot").forEach(el => el.remove());

  /* === LAYOUT: calculate zones first === */
  const visibleGoals = visible.filter(m => !isTask(m));
  const visibleTasks = visible.filter(m => isTask(m));

  /* --- Responsive layout: vh-based with clamp bounds --- */
  const vh = window.innerHeight / 100;
  const MIN_GAP = 20; // minimum pixels between card edges
  const CARD_W = 230; // effective card width for collision (matches max-width + margin)

  /* lane heights scale with viewport */
  const FULL_LANE_H  = Math.min(280, Math.max(200, vh * 22));  // clamp(200, 22vh, 280)
  const COMPACT_LANE_H = Math.min(70, Math.max(50, vh * 6));    // clamp(50, 6vh, 70)
  const BASE_OFFSET  = Math.min(30, Math.max(18, vh * 2.5));    // clamp(18, 2.5vh, 30)

  const goalItems = visibleGoals.map(ms => ({ ms, x: tsToX(msToTs(ms)) }));
  goalItems.sort((a, b) => a.x - b.x);

  // assign lanes with minimum gap enforcement
  const goalLanes = []; // each lane stores rightmost occupied edge
  goalItems.forEach(item => {
    const halfW = CARD_W / 2;
    const left = item.x - halfW;
    const right = item.x + halfW;
    let placed = false;
    for (let l = 0; l < goalLanes.length; l++) {
      if (left >= goalLanes[l] + MIN_GAP) {
        goalLanes[l] = right;
        item.lane = l;
        placed = true;
        break;
      }
    }
    if (!placed) {
      item.lane = goalLanes.length;
      goalLanes.push(right);
    }
  });

  // #2: lane 0 = full card, lane 1+ = compact card
  const goalMaxLane = goalItems.length ? Math.max(...goalItems.map(i => i.lane)) : 0;

  // #3: dynamic heights with responsive task bars
  const TASK_BAR_H = Math.min(32, Math.max(24, vh * 3));   // clamp(24, 3vh, 32)
  const TASK_BAR_GAP = Math.min(10, Math.max(4, vh * 0.8)); // clamp(4, 0.8vh, 10)

  // assign task lanes
  const taskItems = visibleTasks.map(ms => ({
    ms, x1: tsToX(msToTs(ms)), x2: tsToX(msEndTs(ms))
  })).sort((a, b) => a.x1 - b.x1);

  const taskLanes = [];
  taskItems.forEach(item => {
    let placed = false;
    for (let l = 0; l < taskLanes.length; l++) {
      if (item.x1 >= taskLanes[l] + MIN_GAP) {
        taskLanes[l] = item.x2;
        item.lane = l;
        placed = true;
        break;
      }
    }
    if (!placed) {
      item.lane = taskLanes.length;
      taskLanes.push(item.x2);
    }
  });

  const taskMaxLane = taskItems.length ? Math.max(...taskItems.map(i => i.lane)) : -1;

  // #3: calculate dynamic track height (responsive)
  const minGoalZone = Math.min(250, Math.max(160, vh * 22)); // clamp(160, 22vh, 250)
  const minTaskZone = Math.min(80, Math.max(50, vh * 6));     // clamp(50, 6vh, 80)
  const goalZoneH = FULL_LANE_H + goalMaxLane * COMPACT_LANE_H + BASE_OFFSET + 20;
  const taskZoneH = (taskMaxLane + 1) * (TASK_BAR_H + TASK_BAR_GAP) + 20;
  const axisY = Math.max(goalZoneH, minGoalZone);
  const totalTrackH = axisY + Math.max(taskZoneH, minTaskZone);

  $track.style.height = totalTrackH + "px";
  $inner.querySelector(".axis").style.top = axisY + "px";

  /* --- time markers (axis down only — no crossing cards) --- */
  const r = msRange();
  const startYear = new Date(r.min).getFullYear();
  const endYear   = new Date(r.min + r.range).getFullYear();
  const showMonths = zoom >= 0.8, showWeeks = zoom >= 2.0, showQuarters = zoom >= 0.5;
  const markerTop = axisY + 4;
  const markerHeight = totalTrackH - markerTop;

  for (let y = startYear; y <= endYear + 1; y++) {
    addMarker("year", tsToX(new Date(y, 0, 1).getTime()), `${y}`, markerTop, markerHeight);
    if (showMonths) for (let m = 0; m < 12; m++) {
      const mX = tsToX(new Date(y, m, 1).getTime());
      if (mX >= -200 && mX <= w + 200) addMarker("month", mX, MONTHS[m], markerTop, markerHeight);
    }
    if (showQuarters) for (let q = 0; q < 4; q++) {
      const qX = tsToX(new Date(y, q * 3, 1).getTime());
      if (qX >= -200 && qX <= w + 200) addMarker("quarter", qX, `Q${q + 1}`, markerTop, markerHeight);
    }
    if (showWeeks) for (let wk = 1; wk <= 53; wk++) {
      const wX = tsToX(weekToTs(y, wk));
      if (wX >= -200 && wX <= w + 200) addMarker("week", wX, `W${wk}`, markerTop, markerHeight);
    }
  }

  // calculate dot offsets for goals sharing the same axis position
  const DOT_SPREAD_V = 18; // vertical pixels between stacked dots
  const dotGroups = {};
  goalItems.forEach(item => {
    const key = Math.round(item.x);
    if (!dotGroups[key]) dotGroups[key] = [];
    dotGroups[key].push(item);
  });
  Object.values(dotGroups).forEach(group => {
    const total = group.length;
    if (total <= 1) { group[0].dotOffsetY = 0; return; }
    const startOffset = -((total - 1) * DOT_SPREAD_V) / 2;
    group.forEach((item, i) => { item.dotOffsetY = startOffset + i * DOT_SPREAD_V; });
  });

  // === RENDER PASS 1: Connectors (z-index: 2 — behind everything) ===
  goalItems.forEach(({ ms, x, lane }) => {
    const cardOffset = BASE_OFFSET + (lane === 0 ? 0 : FULL_LANE_H + (lane - 1) * COMPACT_LANE_H);
    const connectorH = Math.max(0, cardOffset - 10);
    if (connectorH <= 0) return;
    const dotColor = ms.tag ? getTagColor(ms.tag) : "#888";

    const conn = document.createElement("div");
    conn.className = "goal-connector";
    conn.style.position = "absolute";
    conn.style.left = x + "px";
    conn.style.top = (axisY - 10 - connectorH) + "px";
    conn.style.width = "2px";
    conn.style.height = connectorH + "px";
    conn.style.background = "#999";
    conn.style.transform = "translateX(-50%)";
    conn.style.zIndex = "2";
    conn.style.pointerEvents = "none";
    $inner.appendChild(conn);
  });

  // === RENDER PASS 2: Dots (z-index: 5 — above connectors, below cards) ===
  goalItems.forEach(({ ms, x, dotOffsetY = 0 }) => {
    const dotColor = ms.tag ? getTagColor(ms.tag) : "#888";
    const sc = getStatusColor(ms.status);

    const dot = document.createElement("div");
    dot.className = "goal-dot";
    dot.style.position = "absolute";
    dot.style.left = x + "px";
    dot.style.top = (axisY - 8 + dotOffsetY) + "px";
    dot.style.width = "16px";
    dot.style.height = "16px";
    dot.style.borderRadius = "50%";
    dot.style.background = dotColor;
    dot.style.border = "3px solid var(--bg)";
    dot.style.transform = "translateX(-50%)";
    dot.style.boxShadow = `0 0 10px ${sc}55`;
    dot.style.zIndex = "5";
    dot.style.pointerEvents = "none";
    $inner.appendChild(dot);
  });

  // === RENDER PASS 3: Cards (z-index: 20 — on top of everything) ===
  goalItems.forEach(({ ms, x, lane }) => {
    const sc = getStatusColor(ms.status);
    const sl = getStatusLabel(ms.status);
    const dotColor = ms.tag ? getTagColor(ms.tag) : "#888";
    const tc = ms.tag ? getTagColor(ms.tag) : "";
    const compact = lane > 0;

    const cardOffset = BASE_OFFSET + (lane === 0 ? 0 : FULL_LANE_H + (lane - 1) * COMPACT_LANE_H);

    const el = document.createElement("div");
    el.className = "ms" + (dragId === ms.id ? " no-transition" : "");
    el.style.left = x + "px";
    el.style.top = axisY + "px";
    el.dataset.id = ms.id;

    const tagHtml = ms.tag ? `<span class="card-tag" style="color:${tc};border-color:${tc}44;"><span class="card-dot" style="background:${tc};width:6px;height:6px;display:inline-block;border-radius:50%;margin-right:3px;"></span>${ms.tag}</span>` : "";

    if (compact) {
      el.innerHTML = `
        <div class="card card-compact" style="border-color:${dotColor}44; position:absolute; left:50%; transform:translateX(-50%); bottom:${cardOffset}px;">
          <div class="card-head">
            <span class="card-dot" style="background:${dotColor}"></span>
            <span class="card-title">${ms.title}</span>
          </div>
          <div class="card-detail">
            <p class="card-desc">${ms.desc}</p>
            <div class="card-meta">
              <span class="card-when">${weekLabel(ms.year, ms.week)}</span>
              <span class="card-status" style="background:${sc}22;color:${sc};">${sl}</span>
              ${tagHtml}
            </div>
            <div class="card-id">${ms.id}</div>
            <div class="card-actions">
              <button class="card-btn" data-action="edit" data-eid="${ms.id}">Edit</button>
              <button class="card-btn del" data-action="del" data-eid="${ms.id}">Delete</button>
            </div>
          </div>
        </div>`;
    } else {
      el.innerHTML = `
        <div class="card" style="border-color:${dotColor}66; position:absolute; left:50%; transform:translateX(-50%); bottom:${cardOffset}px;">
          <div class="card-head">
            <span class="card-dot" style="background:${dotColor}"></span>
            <span class="card-title">${ms.title}</span>
          </div>
          <p class="card-desc">${ms.desc}</p>
          <div class="card-meta">
            <span class="card-when">${weekLabel(ms.year, ms.week)}</span>
            <span class="card-status" style="background:${sc}22;color:${sc};">${sl}</span>
            ${tagHtml}
          </div>
          <div class="card-id">${ms.id}</div>
          <div class="card-actions">
            <button class="card-btn" data-action="edit" data-eid="${ms.id}">Edit</button>
            <button class="card-btn del" data-action="del" data-eid="${ms.id}">Delete</button>
          </div>
        </div>`;
    }

    el.addEventListener("mousedown", e => {
      if (e.target.closest(".card-btn")) return;
      e.stopPropagation();
      dragId = ms.id;
      dragIsTask = false;
      dragMoved = false;
      $track.classList.add("dragging");
    });

    $inner.appendChild(el);
  });

  /* --- Task bars: all below the axis --- */
  taskItems.forEach(({ ms, x1, x2, lane }) => {
    const barW = Math.max(40, x2 - x1);
    const tc = ms.tag ? getTagColor(ms.tag) : "#888";
    const sc = getStatusColor(ms.status);
    const sl = getStatusLabel(ms.status);
    const effort = effortWeeks(ms);
    const yOffset = Math.round(TASK_BAR_GAP * 2) + lane * (TASK_BAR_H + TASK_BAR_GAP);

    const bar = document.createElement("div");
    bar.className = "task-bar";
    bar.style.left = x1 + "px";
    bar.style.width = barW + "px";
    bar.style.top = (axisY + yOffset) + "px";
    bar.style.background = `linear-gradient(135deg, ${tc}cc, ${tc}88)`;
    bar.dataset.id = ms.id;

    bar.innerHTML = `<span class="task-title">${ms.title}</span><span class="task-status" style="color:${sc};">${sl}</span><span class="task-effort">Effort: ${effort}w</span>`;

    bar.addEventListener("mousedown", e => {
      e.stopPropagation();
      dragId = ms.id;
      dragIsTask = true;
      dragDurationWeeks = effortWeeks(ms);
      dragMoved = false;
      $track.classList.add("dragging");
    });
    bar.addEventListener("click", e => { if (!dragMoved) openModal("edit", ms); });

    $inner.appendChild(bar);
  });

  /* --- bottom list grouped by quarter, sub-grouped by week --- */
  const totalVisible = visible.length;
  $msCount.textContent = `${totalVisible} item${totalVisible !== 1 ? "s" : ""} shown (${milestones.length} total)`;
  $msList.innerHTML = "";

  const groups = {};
  visible.forEach(ms => {
    const ts = msToTs(ms);
    const d = new Date(ts);
    const q = Math.floor(d.getMonth() / 3) + 1;
    const key = `${d.getFullYear()}-Q${q}`;
    if (!groups[key]) groups[key] = { year: d.getFullYear(), q, items: [] };
    groups[key].items.push(ms);
  });

  Object.keys(groups).sort().forEach(key => {
    const g = groups[key];
    const grp = document.createElement("div"); grp.className = "q-group";
    const header = document.createElement("div"); header.className = "q-group-header";
    header.innerHTML = `<span>Q${g.q} ${g.year}</span><span class="q-count">${g.items.length}</span>`;
    grp.appendChild(header);

    // sub-group by week
    const weekGroups = {};
    g.items.forEach(ms => {
      const wkNum = isTask(ms) ? ms.startWeek : ms.week;
      const wkYear = isTask(ms) ? ms.startYear : ms.year;
      const wk = `${wkYear}-W${String(wkNum).padStart(2, "0")}`;
      if (!weekGroups[wk]) weekGroups[wk] = { ms: [], label: isTask(ms) ? weekLabel(ms.startYear, ms.startWeek) : weekLabel(ms.year, ms.week) };
      weekGroups[wk].ms.push(ms);
    });

    let prevMonth = -1;
    Object.keys(weekGroups).sort().forEach(wk => {
      const wg = weekGroups[wk];

      // determine month of this week group
      const firstMs = wg.ms[0];
      const wkTs = msToTs(firstMs);
      const wkMonth = new Date(wkTs).getMonth();

      const weekRow = document.createElement("div"); weekRow.className = "week-row";
      if (prevMonth >= 0 && wkMonth !== prevMonth) {
        weekRow.classList.add("month-divider");
      }
      prevMonth = wkMonth;

      const weekLabel_ = document.createElement("span"); weekLabel_.className = "week-label";
      weekLabel_.textContent = wg.label;
      weekRow.appendChild(weekLabel_);

      const chipsWrap = document.createElement("div"); chipsWrap.className = "week-chips";
      wg.ms.forEach(ms => {
        const sc = getStatusColor(ms.status);
        const sl = getStatusLabel(ms.status);
        const tc = ms.tag ? getTagColor(ms.tag) : "";
        const tagHtml = ms.tag ? `<span class="chip-tag" style="color:${tc};border-color:${tc}44;">${ms.tag}</span>` : "";
        const chipDotColor = ms.tag ? getTagColor(ms.tag) : "#888";
        const chip = document.createElement("div"); chip.className = "ms-chip" + (isTask(ms) ? " ms-chip-task" : "");
        const whenHtml = isTask(ms)
          ? `<span class="chip-when">${weekLabel(ms.startYear, ms.startWeek)} → ${weekLabel(ms.endYear, ms.endWeek)}</span><span class="chip-status" style="color:var(--accent);font-size:8px;">Effort: ${effortWeeks(ms)}w</span>`
          : `<span class="chip-when">${weekLabel(ms.year, ms.week)}</span>`;
        const typeLabel = isTask(ms) ? `<span class="chip-tag" style="color:#888;border-color:#333;">Task</span>` : "";
        chip.innerHTML = `<span class="chip-dot" style="background:${chipDotColor}"></span>
          <span>${ms.title}</span>
          ${whenHtml}
          <span class="chip-status" style="color:${sc};">${sl}</span>
          ${tagHtml}
          ${typeLabel}
          <span class="chip-id">${ms.id}</span>`;
        chip.onclick = () => openModal("edit", ms);
        chipsWrap.appendChild(chip);
      });

      weekRow.appendChild(chipsWrap);
      grp.appendChild(weekRow);
    });

    $msList.appendChild(grp);
  });
}

function addMarker(type, x, label, markerTop, markerHeight, extraLabel) {
  const mk = document.createElement("div");
  mk.className = "time-marker " + type;
  mk.style.left = x + "px";
  mk.style.top = markerTop + "px";
  mk.style.height = markerHeight + "px";
  let html = `<div class="line"></div><span class="label">${label}</span>`;
  if (extraLabel) html += `<span class="label" style="bottom:44px;font-size:9px;color:#888;font-weight:400;">${extraLabel}</span>`;
  mk.innerHTML = html;
  $inner.appendChild(mk);
}

/* ============================================================
   INTERACTION: pan, zoom, drag
   ============================================================ */
$track.addEventListener("wheel", e => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    zoom = Math.max(0.3, Math.min(6, zoom - e.deltaY * 0.002));
    render();
  } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
    e.preventDefault();
    panX -= e.deltaX || e.deltaY;
    render();
  }
}, { passive: false });

$track.addEventListener("mousedown", e => {
  if (dragId) return;
  isPanning = true; panStartX = e.clientX; panStartVal = panX;
  $track.classList.add("panning");
});

window.addEventListener("mousemove", e => {
  if (isPanning) { panX = panStartVal + (e.clientX - panStartX); render(); }
  if (dragId !== null) {
    dragMoved = true;
    const rect = $track.getBoundingClientRect();
    const localX = e.clientX - rect.left - panX;
    const ts = xToTs(localX);
    const { year, week } = tsToWeek(ts);
    const ms = milestones.find(v => v.id === dragId);
    if (ms) {
      if (isTask(ms)) {
        // shift both start and end, preserving duration
        ms.startYear = year;
        ms.startWeek = Math.max(1, Math.min(53, week));
        const endTs = weekToTs(year, ms.startWeek) + dragDurationWeeks * 7 * 86400000;
        const end = tsToWeek(endTs);
        ms.endYear = end.year;
        ms.endWeek = end.week;
      } else {
        ms.year = year;
        ms.week = Math.max(1, Math.min(53, week));
      }
      render();
    }
  }
});

window.addEventListener("mouseup", () => {
  if (dragId !== null) autoSave();
  isPanning = false; dragId = null; dragIsTask = false; dragDurationWeeks = 0;
  $track.classList.remove("panning", "dragging");
});

$inner.addEventListener("click", e => {
  const btn = e.target.closest(".card-btn");
  if (!btn) return;
  const eid = btn.dataset.eid;
  if (btn.dataset.action === "del") { milestones = milestones.filter(v => v.id !== eid); autoSave(); render(); }
  if (btn.dataset.action === "edit") { openModal("edit", milestones.find(v => v.id === eid)); }
});

document.getElementById("zoomIn").onclick  = () => { zoom = Math.min(6, zoom + 0.3); render(); };
document.getElementById("zoomOut").onclick = () => { zoom = Math.max(0.3, zoom - 0.3); render(); };
document.getElementById("resetView").onclick = () => { zoom = 1; panX = 0; render(); };
document.getElementById("addBtn").onclick = () => openModal("add");

/* Clear All */
document.getElementById("clearAll").onclick = () => {
  if (!confirm("This will delete all milestones, tags, and statuses.\n\nAre you sure?")) return;
  milestones = [];
  tags = [];
  tagColors = {};
  statuses = JSON.parse(JSON.stringify(INIT_STATUSES));
  visibleTags = new Set(["__untagged__"]);
  visibleStatuses = new Set(statuses.map(s => s.key));
  zoom = 1; panX = 0;
  autoSave();
  renderFilters(); render();
  showExportMsg("Timeline cleared");
};

/* double-click on timeline to add */
$track.addEventListener("dblclick", e => {
  if (e.target.closest(".ms") || e.target.closest(".task-bar")) return;
  const rect = $track.getBoundingClientRect();
  const localX = e.clientX - rect.left - panX;
  const ts = xToTs(localX);
  const { year, week } = tsToWeek(ts);
  openModal("add", null, year, week);
});

/* ============================================================
   MILESTONE MODAL
   ============================================================ */
const $modalBg = document.getElementById("modalBg");
let modalMode = "add", modalMs = null, modalStatus = "undefined", modalPeriod = "early", modalEndPeriod = "mid", modalType = "goal";
const PERIODS = [
  { key: "early", label: "Early", dayOffset: 3 },
  { key: "mid",   label: "Mid",   dayOffset: 14 },
  { key: "late",  label: "Late",  dayOffset: 24 },
];

function openModal(mode, ms, presetYear, presetWeek) {
  modalMode = mode; modalMs = ms || null;
  document.getElementById("modalTitle").textContent = mode === "add" ? "Add Milestone" : "Edit Milestone";
  document.getElementById("fTitle").value = ms ? ms.title : "";
  document.getElementById("fDesc").value  = ms ? ms.desc  : "";
  if (ms) {
    document.getElementById("fIdRow").style.display = "block";
    document.getElementById("fId").textContent = ms.id;
  } else {
    document.getElementById("fIdRow").style.display = "none";
  }
  modalStatus = ms ? ms.status : "undefined";

  // type toggle
  modalType = (ms && isTask(ms)) ? "task" : "goal";
  document.querySelectorAll('input[name="fType"]').forEach(r => {
    r.checked = (r.value === modalType);
    r.onchange = () => { modalType = r.value; toggleTypeUI(); updateAllPreviews(); };
  });

  // start date
  let initYear, initMonth;
  if (ms && isTask(ms)) {
    const d = new Date(weekToTs(ms.startYear, ms.startWeek));
    initYear = d.getFullYear(); initMonth = d.getMonth();
    modalPeriod = d.getDate() <= 10 ? "early" : d.getDate() <= 20 ? "mid" : "late";
  } else if (ms) {
    const d = new Date(weekToTs(ms.year, ms.week));
    initYear = d.getFullYear(); initMonth = d.getMonth();
    modalPeriod = d.getDate() <= 10 ? "early" : d.getDate() <= 20 ? "mid" : "late";
  } else if (presetYear != null && presetWeek != null) {
    const d = new Date(weekToTs(presetYear, presetWeek));
    initYear = d.getFullYear(); initMonth = d.getMonth();
    modalPeriod = d.getDate() <= 10 ? "early" : d.getDate() <= 20 ? "mid" : "late";
  } else {
    const now = new Date();
    initYear = now.getFullYear(); initMonth = now.getMonth();
    modalPeriod = now.getDate() <= 10 ? "early" : now.getDate() <= 20 ? "mid" : "late";
  }

  const $year = document.getElementById("fYear"); $year.innerHTML = "";
  const curYear = new Date().getFullYear();
  for (let y = curYear - 2; y <= curYear + 5; y++) {
    const opt = document.createElement("option"); opt.value = y; opt.textContent = y;
    if (y === initYear) opt.selected = true;
    $year.appendChild(opt);
  }
  const $month = document.getElementById("fMonth"); $month.innerHTML = "";
  MONTHS.forEach((m, i) => {
    const opt = document.createElement("option"); opt.value = i; opt.textContent = m;
    if (i === initMonth) opt.selected = true;
    $month.appendChild(opt);
  });

  // end date
  let endInitYear, endInitMonth;
  if (ms && isTask(ms)) {
    const d = new Date(weekToTs(ms.endYear, ms.endWeek));
    endInitYear = d.getFullYear(); endInitMonth = d.getMonth();
    modalEndPeriod = d.getDate() <= 10 ? "early" : d.getDate() <= 20 ? "mid" : "late";
  } else {
    endInitYear = initYear; endInitMonth = Math.min(11, initMonth + 2);
    modalEndPeriod = "mid";
  }

  const $endYear = document.getElementById("fEndYear"); $endYear.innerHTML = "";
  for (let y = curYear - 2; y <= curYear + 5; y++) {
    const opt = document.createElement("option"); opt.value = y; opt.textContent = y;
    if (y === endInitYear) opt.selected = true;
    $endYear.appendChild(opt);
  }
  const $endMonth = document.getElementById("fEndMonth"); $endMonth.innerHTML = "";
  MONTHS.forEach((m, i) => {
    const opt = document.createElement("option"); opt.value = i; opt.textContent = m;
    if (i === endInitMonth) opt.selected = true;
    $endMonth.appendChild(opt);
  });

  renderPeriodPicks();
  renderEndPeriodPicks();
  toggleTypeUI();
  updateAllPreviews();
  $year.onchange = updateAllPreviews;
  $month.onchange = updateAllPreviews;
  $endYear.onchange = updateAllPreviews;
  $endMonth.onchange = updateAllPreviews;

  function toggleTypeUI() {
    const isT = modalType === "task";
    document.getElementById("dateLabelStart").style.display = isT ? "block" : "none";
    document.getElementById("endDateSection").style.display = isT ? "block" : "none";
  }

  function updateAllPreviews() {
    const resolved = resolveToWeek();
    const wkStart = new Date(weekToTs(resolved.year, resolved.week));
    const wkEnd = new Date(wkStart.getTime() + 6 * 86400000);
    document.getElementById("weekPreview").textContent =
      `\u2192 W${resolved.week} ${resolved.year}  (${fmtPreviewDate(wkStart)} \u2013 ${fmtPreviewDate(wkEnd)})`;

    if (modalType === "task") {
      const resolvedEnd = resolveEndToWeek();
      const ewkStart = new Date(weekToTs(resolvedEnd.year, resolvedEnd.week));
      const ewkEnd = new Date(ewkStart.getTime() + 6 * 86400000);
      document.getElementById("endWeekPreview").textContent =
        `\u2192 W${resolvedEnd.week} ${resolvedEnd.year}  (${fmtPreviewDate(ewkStart)} \u2013 ${fmtPreviewDate(ewkEnd)})`;
      const startTs = weekToTs(resolved.year, resolved.week);
      const endTs = weekToTs(resolvedEnd.year, resolvedEnd.week);
      const weeks = Math.max(1, Math.round((endTs - startTs) / (7 * 86400000)));
      document.getElementById("effortPreview").textContent = weeks > 0 ? `Effort: ${weeks} week${weeks > 1 ? "s" : ""}` : "End must be after start";
    }
  }

  function renderPeriodPicks() {
    const c = document.getElementById("fPeriod"); c.innerHTML = "";
    PERIODS.forEach(p => {
      const el = document.createElement("div");
      el.className = "period-pick" + (p.key === modalPeriod ? " active" : "");
      el.textContent = p.label;
      el.onclick = () => { modalPeriod = p.key; renderPeriodPicks(); updateAllPreviews(); };
      c.appendChild(el);
    });
  }

  function renderEndPeriodPicks() {
    const c = document.getElementById("fEndPeriod"); c.innerHTML = "";
    PERIODS.forEach(p => {
      const el = document.createElement("div");
      el.className = "period-pick" + (p.key === modalEndPeriod ? " active" : "");
      el.textContent = p.label;
      el.onclick = () => { modalEndPeriod = p.key; renderEndPeriodPicks(); updateAllPreviews(); };
      c.appendChild(el);
    });
  }

  function resolveToWeek() {
    const y = parseInt($year.value);
    const m = parseInt($month.value);
    const dayOff = PERIODS.find(p => p.key === modalPeriod).dayOffset;
    const target = new Date(y, m, dayOff);
    return tsToWeek(target.getTime());
  }

  function resolveEndToWeek() {
    const y = parseInt($endYear.value);
    const m = parseInt($endMonth.value);
    const dayOff = PERIODS.find(p => p.key === modalEndPeriod).dayOffset;
    const target = new Date(y, m, dayOff);
    return tsToWeek(target.getTime());
  }

  $modalBg._resolveToWeek = resolveToWeek;
  $modalBg._resolveEndToWeek = resolveEndToWeek;

  const $tag = document.getElementById("fTag"); $tag.innerHTML = "";
  const noneOpt = document.createElement("option"); noneOpt.value = ""; noneOpt.textContent = "\u2014 No tag \u2014"; $tag.appendChild(noneOpt);
  tags.forEach(t => {
    const opt = document.createElement("option"); opt.value = t; opt.textContent = t;
    if (ms && ms.tag === t) opt.selected = true;
    $tag.appendChild(opt);
  });

  // inline new tag creation
  document.getElementById("fNewTag").onclick = () => {
    const name = prompt("New tag name:");
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    if (tags.includes(trimmed)) {
      $tag.value = trimmed;
      return;
    }
    tags.push(trimmed);
    tagColors[trimmed] = TAG_PALETTE[tags.length % TAG_PALETTE.length];
    visibleTags.add(trimmed);
    const opt = document.createElement("option"); opt.value = trimmed; opt.textContent = trimmed;
    $tag.appendChild(opt);
    $tag.value = trimmed;
    autoSave(); renderFilters();
  };

  renderStatusPicks();

  const $act = document.getElementById("modalActions");
  if (mode === "add") {
    $act.innerHTML = `<button class="btn btn-accent" id="mSave">Add Milestone</button><button class="btn" id="mCancel">Cancel</button>`;
  } else {
    $act.innerHTML = `<button class="btn btn-save" id="mSave">Save</button><button class="btn btn-danger" id="mDel">Delete</button><button class="btn" id="mCancel">Cancel</button>`;
    document.getElementById("mDel").onclick = () => { milestones = milestones.filter(v => v.id !== ms.id); autoSave(); closeModal(); render(); };
  }
  document.getElementById("mSave").onclick = saveModal;
  document.getElementById("mCancel").onclick = closeModal;
  $modalBg.style.display = "flex";
}

function fmtPreviewDate(d) {
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function renderStatusPicks() {
  const c = document.getElementById("fStatus"); c.innerHTML = "";
  statuses.forEach(st => {
    const s = document.createElement("div");
    s.className = "status-pick" + (st.key === modalStatus ? " active" : "");
    s.style.background = st.color + "22";
    s.style.color = st.color;
    s.textContent = st.label;
    s.onclick = () => { modalStatus = st.key; renderStatusPicks(); };
    c.appendChild(s);
  });
}

function saveModal() {
  const title = document.getElementById("fTitle").value.trim();
  const desc  = document.getElementById("fDesc").value.trim();
  const tag   = document.getElementById("fTag").value || "";
  if (!title) return;

  const { year, week } = $modalBg._resolveToWeek();

  if (modalType === "task") {
    const end = $modalBg._resolveEndToWeek();
    const data = { type: "task", title, desc, startYear: year, startWeek: week, endYear: end.year, endWeek: end.week, status: modalStatus, tag };
    if (modalMode === "add") {
      data.id = generateId();
      milestones.push(data);
    } else if (modalMs) {
      // remove goal fields if switching from goal to task
      delete modalMs.year; delete modalMs.week;
      Object.assign(modalMs, data);
    }
  } else {
    const data = { type: "goal", title, desc, year, week, status: modalStatus, tag };
    if (modalMode === "add") {
      data.id = generateId();
      milestones.push(data);
    } else if (modalMs) {
      // remove task fields if switching from task to goal
      delete modalMs.startYear; delete modalMs.startWeek; delete modalMs.endYear; delete modalMs.endWeek;
      Object.assign(modalMs, data);
    }
  }
  if (tag && !visibleTags.has(tag)) visibleTags.add(tag);
  autoSave();
  closeModal(); renderFilters(); render();
}
function closeModal() { $modalBg.style.display = "none"; }
$modalBg.addEventListener("click", e => { if (e.target === $modalBg) closeModal(); });

/* ============================================================
   TAG MANAGER MODAL
   ============================================================ */
const $tagModalBg = document.getElementById("tagModalBg");
document.getElementById("tagsBtn").onclick = openTagModal;
document.getElementById("closeTagModal").onclick = () => { $tagModalBg.style.display = "none"; };
$tagModalBg.addEventListener("click", e => { if (e.target === $tagModalBg) $tagModalBg.style.display = "none"; });

function openTagModal() {
  renderTagList();
  $tagModalBg.style.display = "flex";
}

function renderTagList() {
  const $list = document.getElementById("tagList"); $list.innerHTML = "";
  tags.forEach((tag, i) => {
    const inUse = milestones.some(m => m.tag === tag);
    const tc = getTagColor(tag);
    const row = document.createElement("div"); row.className = "tag-row";
    row.innerHTML = `
      <span style="width:20px;height:12px;border-radius:3px;background:${tc};flex-shrink:0;"></span>
      <span style="flex:1">${tag}</span>
      <span style="font-size:10px;font-family:var(--font-mono);color:#555">${inUse ? "in use" : ""}</span>
      <button class="btn btn-sm" data-ti="${i}" data-action="color">Colour</button>
      <button class="btn btn-sm" data-ti="${i}" data-action="rename">Rename</button>
      <button class="btn btn-sm${inUse ? "" : " btn-danger"}" data-ti="${i}" data-action="del" ${inUse ? "disabled style='opacity:0.3;cursor:not-allowed'" : ""}>Delete</button>`;
    $list.appendChild(row);
  });

  $list.onclick = e => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const idx = parseInt(btn.dataset.ti);
    if (btn.dataset.action === "del") {
      const tag = tags[idx];
      tags.splice(idx, 1);
      delete tagColors[tag];
      visibleTags.delete(tag);
      autoSave(); renderTagList(); renderFilters(); render();
    }
    if (btn.dataset.action === "rename") {
      const oldName = tags[idx];
      const newName = prompt("Rename tag:", oldName);
      if (newName && newName.trim() && newName.trim() !== oldName) {
        const trimmed = newName.trim();
        const oldColor = tagColors[oldName];
        tags[idx] = trimmed;
        delete tagColors[oldName];
        tagColors[trimmed] = oldColor;
        milestones.forEach(m => { if (m.tag === oldName) m.tag = trimmed; });
        if (visibleTags.has(oldName)) { visibleTags.delete(oldName); visibleTags.add(trimmed); }
        autoSave(); renderTagList(); renderFilters(); render();
      }
    }
    if (btn.dataset.action === "color") {
      const tag = tags[idx];
      const cur = tagColors[tag];
      const curI = TAG_PALETTE.indexOf(cur);
      tagColors[tag] = TAG_PALETTE[(curI + 1) % TAG_PALETTE.length];
      autoSave(); renderTagList(); renderFilters(); render();
    }
  };
}

document.getElementById("addTagBtn").onclick = () => {
  const $input = document.getElementById("newTagInput");
  const name = $input.value.trim();
  if (!name || tags.includes(name)) return;
  tags.push(name);
  tagColors[name] = TAG_PALETTE[tags.length % TAG_PALETTE.length];
  visibleTags.add(name);
  $input.value = "";
  autoSave(); renderTagList(); renderFilters();
};

/* ============================================================
   STATUS MANAGER MODAL
   ============================================================ */
const $statusModalBg = document.getElementById("statusModalBg");
document.getElementById("statusBtn").onclick = openStatusModal;
document.getElementById("closeStatusModal").onclick = () => { $statusModalBg.style.display = "none"; };
$statusModalBg.addEventListener("click", e => { if (e.target === $statusModalBg) $statusModalBg.style.display = "none"; });

function openStatusModal() {
  renderStatusList();
  $statusModalBg.style.display = "flex";
}

function renderStatusList() {
  const $list = document.getElementById("statusList"); $list.innerHTML = "";
  statuses.forEach((st, i) => {
    const inUse = milestones.some(m => m.status === st.key);
    const row = document.createElement("div"); row.className = "tag-row";
    row.innerHTML = `
      <span style="width:20px;height:12px;border-radius:3px;background:${st.color};flex-shrink:0;"></span>
      <span style="flex:1">${st.label}</span>
      <span style="font-size:10px;font-family:var(--font-mono);color:#555">${inUse ? "in use" : ""}</span>
      <button class="btn btn-sm" data-si="${i}" data-action="color">Colour</button>
      <button class="btn btn-sm" data-si="${i}" data-action="rename">Rename</button>
      <button class="btn btn-sm${inUse ? "" : " btn-danger"}" data-si="${i}" data-action="del" ${inUse ? "disabled style='opacity:0.3;cursor:not-allowed'" : ""}>Delete</button>`;
    $list.appendChild(row);
  });

  $list.onclick = e => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const idx = parseInt(btn.dataset.si);
    if (btn.dataset.action === "del") {
      const st = statuses[idx];
      statuses.splice(idx, 1);
      visibleStatuses.delete(st.key);
      autoSave(); renderStatusList(); renderFilters(); render();
    }
    if (btn.dataset.action === "rename") {
      const oldLabel = statuses[idx].label;
      const newLabel = prompt("Rename status:", oldLabel);
      if (newLabel && newLabel.trim() && newLabel.trim() !== oldLabel) {
        const trimmed = newLabel.trim();
        const oldKey = statuses[idx].key;
        const newKey = trimmed.toLowerCase().replace(/[^a-z0-9]/g, "");
        statuses[idx].label = trimmed;
        statuses[idx].key = newKey;
        milestones.forEach(m => { if (m.status === oldKey) m.status = newKey; });
        if (visibleStatuses.has(oldKey)) { visibleStatuses.delete(oldKey); visibleStatuses.add(newKey); }
        autoSave(); renderStatusList(); renderFilters(); render();
      }
    }
    if (btn.dataset.action === "color") {
      openColorPicker(idx);
    }
  };
}

function openColorPicker(statusIdx) {
  const current = statuses[statusIdx].color;
  const curI = STATUS_PALETTE.indexOf(current);
  const nextI = (curI + 1) % STATUS_PALETTE.length;
  statuses[statusIdx].color = STATUS_PALETTE[nextI];
  autoSave(); renderStatusList(); renderFilters(); render();
}

document.getElementById("addStatusBtn").onclick = () => {
  const $input = document.getElementById("newStatusInput");
  const label = $input.value.trim();
  if (!label) return;
  const key = label.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (statuses.some(s => s.key === key)) return;
  const color = STATUS_PALETTE[statuses.length % STATUS_PALETTE.length];
  statuses.push({ key, label, color });
  visibleStatuses.add(key);
  $input.value = "";
  autoSave(); renderStatusList(); renderFilters();
};

/* ============================================================
   BATCH ADD MILESTONES
   ============================================================ */
const $batchModalBg = document.getElementById("batchModalBg");
const $batchInput = document.getElementById("batchInput");
const $batchPreview = document.getElementById("batchPreview");

document.getElementById("batchAddBtn").onclick = () => {
  $batchInput.value = "";
  $batchPreview.innerHTML = "";
  $batchModalBg.style.display = "flex";
  $batchInput.focus();
};
document.getElementById("batchCancel").onclick = () => { $batchModalBg.style.display = "none"; };
$batchModalBg.addEventListener("click", e => { if (e.target === $batchModalBg) $batchModalBg.style.display = "none"; });

const MONTH_MAP = {};
MONTHS.forEach((m, i) => {
  MONTH_MAP[m.toLowerCase()] = i;
  const full = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  full.forEach((f, j) => { MONTH_MAP[f] = j; });
});

function parseDate(dateStr) {
  let month = -1, year = -1;
  const mMatch = dateStr.match(/^([a-z]+)\s+(\d{4})$/i);
  if (mMatch) { const mi = MONTH_MAP[mMatch[1].toLowerCase()]; if (mi !== undefined) { month = mi; year = parseInt(mMatch[2]); } }
  if (month < 0) { const m = dateStr.match(/^(\d{4})-(\d{1,2})$/); if (m) { year = parseInt(m[1]); month = parseInt(m[2]) - 1; } }
  if (month < 0) { const m = dateStr.match(/^(\d{1,2})\/(\d{4})$/); if (m) { month = parseInt(m[1]) - 1; year = parseInt(m[2]); } }
  if (month < 0) { const m = dateStr.match(/^(\d{2})(\d{4})$/); if (m) { month = parseInt(m[1]) - 1; year = parseInt(m[2]); } }
  if (month >= 0 && month <= 11 && year >= 0) return { month, year };
  return null;
}

const periodMap = { early: 3, mid: 14, late: 24, e: 3, m: 14, l: 24 };
const periodLabels = { early: "Early", mid: "Mid", late: "Late", e: "Early", m: "Mid", l: "Late" };

function parseBatchLines(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
  const results = [];

  lines.forEach((line, lineIdx) => {
    const parts = line.split(",").map(p => p.trim());
    if (parts.length < 2) {
      results.push({ error: `Line ${lineIdx + 1}: need at least title and date`, line });
      return;
    }

    const title = parts[0];
    if (!title) { results.push({ error: `Line ${lineIdx + 1}: title is empty`, line }); return; }

    // check for duration syntax: "date + Nw"
    const dateField = parts[1];
    const durationMatch = dateField.match(/^(.+?)\s*\+\s*(\d+)w$/i);

    if (durationMatch) {
      // TASK with duration: title, date + Nw, e/m/l, tag, status
      const startDate = parseDate(durationMatch[1].trim());
      if (!startDate) { results.push({ error: `Line ${lineIdx + 1}: can't parse date "${durationMatch[1].trim()}"`, line }); return; }
      const durationWeeks = parseInt(durationMatch[2]);

      const pStr = (parts[2] || "mid").toLowerCase().trim();
      const tag = parts[3] || "";
      const statusStr = (parts[4] || "undefined").toLowerCase().replace(/\s+/g, "");
      let statusKey = "undefined";
      const found = statuses.find(s => s.key === statusStr || s.label.toLowerCase().replace(/\s+/g, "") === statusStr);
      if (found) statusKey = found.key;

      const startTarget = new Date(startDate.year, startDate.month, periodMap[pStr] || 14);
      const resolvedStart = tsToWeek(startTarget.getTime());
      const endTs = startTarget.getTime() + durationWeeks * 7 * 86400000;
      const resolvedEnd = tsToWeek(endTs);

      results.push({
        ok: true, isTask: true,
        milestone: { type: "task", title, desc: "", startYear: resolvedStart.year, startWeek: resolvedStart.week, endYear: resolvedEnd.year, endWeek: resolvedEnd.week, status: statusKey, tag },
        display: { title, startPeriod: periodLabels[pStr] || "Mid", startMonth: MONTHS[startDate.month], startYear: startDate.year, effort: durationWeeks, tag, status: getStatusLabel(statusKey) }
      });

    } else {
      const startDate = parseDate(dateField);
      if (!startDate) { results.push({ error: `Line ${lineIdx + 1}: can't parse date "${dateField}"`, line }); return; }

      const pStr = (parts[2] || "mid").toLowerCase().trim();
      const tag = parts[3] || "";
      const statusStr = (parts[4] || "undefined").toLowerCase().replace(/\s+/g, "");
      let statusKey = "undefined";
      const found = statuses.find(s => s.key === statusStr || s.label.toLowerCase().replace(/\s+/g, "") === statusStr);
      if (found) statusKey = found.key;

      // check for end date: field 5 is a date, field 6 is end period
      const possibleEndDate = parts.length >= 6 ? parseDate(parts[5]) : null;

      if (possibleEndDate) {
        // TASK with end date: title, date, e/m/l, tag, status, end_date, e/m/l
        const endPStr = (parts[6] || "mid").toLowerCase().trim();

        const startTarget = new Date(startDate.year, startDate.month, periodMap[pStr] || 14);
        const endTarget = new Date(possibleEndDate.year, possibleEndDate.month, periodMap[endPStr] || 14);
        const resolvedStart = tsToWeek(startTarget.getTime());
        const resolvedEnd = tsToWeek(endTarget.getTime());
        const weeks = Math.max(1, Math.round((endTarget.getTime() - startTarget.getTime()) / (7 * 86400000)));

        results.push({
          ok: true, isTask: true,
          milestone: { type: "task", title, desc: "", startYear: resolvedStart.year, startWeek: resolvedStart.week, endYear: resolvedEnd.year, endWeek: resolvedEnd.week, status: statusKey, tag },
          display: { title, startPeriod: periodLabels[pStr] || "Mid", startMonth: MONTHS[startDate.month], startYear: startDate.year, endPeriod: periodLabels[endPStr] || "Mid", endMonth: MONTHS[possibleEndDate.month], endYear: possibleEndDate.year, effort: weeks, tag, status: getStatusLabel(statusKey) }
        });

      } else {
        // GOAL: title, date, e/m/l, tag, status
        const dayOffset = periodMap[pStr] || 14;
        const target = new Date(startDate.year, startDate.month, dayOffset);
        const resolved = tsToWeek(target.getTime());

        results.push({
          ok: true, isTask: false,
          milestone: { type: "goal", title, desc: "", year: resolved.year, week: resolved.week, status: statusKey, tag },
          display: { title, period: periodLabels[pStr] || "Mid", month: MONTHS[startDate.month], year: startDate.year, tag, status: getStatusLabel(statusKey) }
        });
      }
    }
  });

  return results;
}

$batchInput.addEventListener("input", () => {
  const results = parseBatchLines($batchInput.value);
  if (!results.length) { $batchPreview.innerHTML = ""; return; }

  let html = '<div style="margin-bottom:6px;color:#aaa;">' + results.filter(r => r.ok).length + ' valid, ' + results.filter(r => r.error).length + ' errors</div>';

  results.forEach(r => {
    if (r.error) {
      html += `<div style="color:var(--danger);padding:2px 0;">${r.error}</div>`;
    } else {
      const d = r.display;
      const sc = getStatusColor(r.milestone.status);
      const tc = d.tag ? getTagColor(d.tag) : "";
      html += `<div style="padding:2px 0;display:flex;gap:8px;align-items:center;">`;
      if (r.isTask) {
        html += `<span style="color:#888;font-size:9px;">TASK</span>`;
        html += `<span style="color:#eee;">${d.title}</span>`;
        if (d.endMonth) {
          html += `<span style="color:#666;">${d.startPeriod} ${d.startMonth} ${d.startYear} → ${d.endPeriod} ${d.endMonth} ${d.endYear}</span>`;
        } else {
          html += `<span style="color:#666;">${d.startPeriod} ${d.startMonth} ${d.startYear}</span>`;
        }
        html += `<span style="color:var(--accent);font-size:9px;">Effort: ${d.effort}w</span>`;
      } else {
        html += `<span style="color:#888;font-size:9px;">GOAL</span>`;
        html += `<span style="color:#eee;">${d.title}</span>`;
        html += `<span style="color:#666;">${d.period} ${d.month} ${d.year}</span>`;
      }
      if (d.tag) html += `<span style="color:${tc};">${d.tag}</span>`;
      html += `<span style="color:${sc};text-transform:uppercase;font-size:9px;font-weight:700;">${d.status}</span>`;
      html += `</div>`;
    }
  });

  $batchPreview.innerHTML = html;
});

document.getElementById("batchImport").onclick = () => {
  const results = parseBatchLines($batchInput.value);
  const valid = results.filter(r => r.ok);
  if (!valid.length) { showExportMsg("No valid milestones to import"); return; }

  valid.forEach(r => {
    const ms = r.milestone;
    ms.id = generateId();
    milestones.push(ms);

    if (ms.tag && !tags.includes(ms.tag)) {
      tags.push(ms.tag);
      tagColors[ms.tag] = TAG_PALETTE[tags.length % TAG_PALETTE.length];
      visibleTags.add(ms.tag);
    }
  });

  autoSave();
  $batchModalBg.style.display = "none";
  renderFilters(); render();
  showExportMsg(`${valid.length} milestone${valid.length > 1 ? "s" : ""} added`);
};

function download(blob, name) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
function showExportMsg(msg) {
  const el = document.getElementById("exportMsg"); el.textContent = msg;
  setTimeout(() => el.textContent = "", 2000);
}

/* ============================================================
   DATA PERSISTENCE
   ============================================================ */
const STORAGE_KEY = "planning-timeline-data";

function autoSave() {
  try {
    const data = { milestones, tags, tagColors, statuses };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) { /* silently fail */ }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data.milestones) milestones = data.milestones;
    if (data.tags) tags = data.tags;
    if (data.tagColors) tagColors = data.tagColors;
    if (data.statuses) statuses = data.statuses;
    visibleTags = new Set([...tags, "__untagged__"]);
    visibleStatuses = new Set(statuses.map(s => s.key));
    migrateIds();
    return true;
  } catch (e) { return false; }
}

function migrateIds() {
  let migrated = false;
  const today = new Date();
  const dateStr = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,"0")}${String(today.getDate()).padStart(2,"0")}`;
  let seq = 1;
  milestones.forEach(m => {
    if (typeof m.id === "number" || (typeof m.id === "string" && !/^\d{2,}-\d{8}$/.test(m.id))) {
      m.id = `${String(seq).padStart(2,"0")}-${dateStr}`;
      seq++;
      migrated = true;
    }
  });
  if (migrated) autoSave();
}

/* Save to JSON file */
document.getElementById("saveData").onclick = () => {
  const data = { milestones, tags, tagColors, statuses };
  const json = JSON.stringify(data, null, 2);
  download(new Blob([json], { type: "application/json" }), "timeline-data.json");
  showExportMsg("Data saved!");
};

/* Load from JSON file */
document.getElementById("loadData").onclick = () => {
  document.getElementById("fileInput").click();
};

document.getElementById("fileInput").onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (data.milestones) milestones = data.milestones;
      if (data.tags) tags = data.tags;
      if (data.tagColors) tagColors = data.tagColors;
      if (data.statuses) statuses = data.statuses;
      visibleTags = new Set([...tags, "__untagged__"]);
      visibleStatuses = new Set(statuses.map(s => s.key));
      migrateIds();
      autoSave();
      renderFilters(); render();
      showExportMsg("Data loaded!");
    } catch (err) {
      showExportMsg("Error: invalid file");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
};

/* ============================================================
   INIT
   ============================================================ */
const loaded = loadFromStorage();
if (loaded) {
  showExportMsg("Restored from local storage");
}
renderFilters();
render();

/* re-render on resize for responsive layout */
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(render, 150);
});
