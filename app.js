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
let dragId = null;

// filters
let visibleTags = new Set(tags);
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
function msToTs(m) { return weekToTs(m.year, m.week); }
function sortedMs() { return [...milestones].sort((a, b) => msToTs(a) - msToTs(b)); }

/* ============================================================
   COORDINATES
   ============================================================ */
function msRange() {
  const s = sortedMs();
  const minTs = s.length ? msToTs(s[0]) : Date.now();
  const maxTs = s.length ? msToTs(s[s.length - 1]) : Date.now();
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

  $inner.querySelectorAll(".time-marker, .ms").forEach(el => el.remove());

  /* --- time markers --- */
  const r = msRange();
  const startYear = new Date(r.min).getFullYear();
  const endYear   = new Date(r.min + r.range).getFullYear();
  const showMonths = zoom >= 0.8, showWeeks = zoom >= 2.0, showQuarters = zoom >= 0.5;

  for (let y = startYear; y <= endYear + 1; y++) {
    addMarker("year", tsToX(new Date(y, 0, 1).getTime()), `${y}`);
    if (showMonths) for (let m = 0; m < 12; m++) {
      const mX = tsToX(new Date(y, m, 1).getTime());
      if (mX >= -200 && mX <= w + 200) addMarker("month", mX, MONTHS[m]);
    }
    if (showQuarters) for (let q = 0; q < 4; q++) {
      const qX = tsToX(new Date(y, q * 3, 1).getTime());
      if (qX >= -200 && qX <= w + 200) addMarker("quarter", qX, `Q${q + 1}`);
    }
    if (showWeeks) for (let wk = 1; wk <= 53; wk++) {
      const wX = tsToX(weekToTs(y, wk));
      if (wX >= -200 && wX <= w + 200) addMarker("week", wX, `W${wk}`);
    }
  }

  /* --- milestone cards with collision-aware staggering --- */
  const CARD_COLLISION_W = 140;
  const LANE_HEIGHT = 120;
  const BASE_OFFSET = 22;
  const CONNECTOR_BASE = 60;

  const withX = visible.map(ms => ({ ms, x: tsToX(msToTs(ms)) }));
  withX.sort((a, b) => a.x - b.x);

  const aboveItems = [], belowItems = [];
  withX.forEach((item, i) => {
    if (i % 2 === 0) aboveItems.push(item);
    else belowItems.push(item);
  });

  function assignLanes(items) {
    const lanes = [];
    items.forEach(item => {
      const halfW = CARD_COLLISION_W / 2;
      const left = item.x - halfW;
      const right = item.x + halfW;
      let placed = false;
      for (let l = 0; l < lanes.length; l++) {
        if (left >= lanes[l]) {
          lanes[l] = right;
          item.lane = l;
          placed = true;
          break;
        }
      }
      if (!placed) {
        item.lane = lanes.length;
        lanes.push(right);
      }
    });
  }

  assignLanes(aboveItems);
  assignLanes(belowItems);

  const allPlaced = [...aboveItems.map(i => ({...i, above: true})), ...belowItems.map(i => ({...i, above: false}))];

  allPlaced.forEach(({ ms, x, above, lane }) => {
    const sc = getStatusColor(ms.status);
    const sl = getStatusLabel(ms.status);
    const dotColor = ms.tag ? getTagColor(ms.tag) : "#888";
    const tc = ms.tag ? getTagColor(ms.tag) : "";

    const cardOffset = BASE_OFFSET + lane * LANE_HEIGHT;
    const connectorH = CONNECTOR_BASE + lane * LANE_HEIGHT;

    const el = document.createElement("div");
    el.className = "ms" + (dragId === ms.id ? " no-transition" : "");
    el.style.left = x + "px";
    el.style.top = "280px";
    el.dataset.id = ms.id;

    const tagHtml = ms.tag ? `<span class="card-tag" style="color:${tc};border-color:${tc}44;"><span class="card-dot" style="background:${tc};width:6px;height:6px;display:inline-block;border-radius:50%;margin-right:3px;"></span>${ms.tag}</span>` : "";

    el.innerHTML = `
      <div class="dot-ax" style="top:-8px; background:${dotColor}; box-shadow:0 0 12px ${sc}55;"></div>
      <div class="connector" style="${above ? "bottom:10px;" : "top:10px;"} height:${connectorH}px;"></div>
      <div class="card" style="border-color:${dotColor}66; position:absolute; left:50%; transform:translateX(-50%); ${above ? `bottom:${cardOffset}px;` : `top:${cardOffset}px;`}">
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

    el.addEventListener("mousedown", e => {
      if (e.target.closest(".card-btn")) return;
      e.stopPropagation();
      dragId = ms.id;
      $track.classList.add("dragging");
    });

    $inner.appendChild(el);
  });

  /* --- check card overflow and switch to horizontal if needed --- */
  const TRACK_H = 560;
  const AXIS_Y = 280;
  requestAnimationFrame(() => {
    $inner.querySelectorAll(".ms").forEach(msEl => {
      const card = msEl.querySelector(".card");
      if (!card) return;

      const cardRect = card.getBoundingClientRect();
      const trackRect = $track.getBoundingClientRect();
      const cardTop = cardRect.top - trackRect.top;
      const cardBot = cardRect.bottom - trackRect.top;

      if (cardTop < 0 || cardBot > TRACK_H) {
        card.classList.add("card-hz");
      }
    });
  });

  /* --- bottom list grouped by quarter --- */
  const totalVisible = visible.length;
  $msCount.textContent = `${totalVisible} milestone${totalVisible !== 1 ? "s" : ""} shown (${milestones.length} total)`;
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

    const items = document.createElement("div"); items.className = "q-group-items";
    g.items.forEach(ms => {
      const sc = getStatusColor(ms.status);
      const sl = getStatusLabel(ms.status);
      const tc = ms.tag ? getTagColor(ms.tag) : "";
      const tagHtml = ms.tag ? `<span class="chip-tag" style="color:${tc};border-color:${tc}44;">${ms.tag}</span>` : "";
      const chipDotColor = ms.tag ? getTagColor(ms.tag) : "#888";
      const chip = document.createElement("div"); chip.className = "ms-chip";
      chip.innerHTML = `<span class="chip-dot" style="background:${chipDotColor}"></span>
        <span>${ms.title}</span>
        <span class="chip-when">${weekLabel(ms.year, ms.week)}</span>
        <span class="chip-status" style="color:${sc};">${sl}</span>
        ${tagHtml}
        <span class="chip-id">${ms.id}</span>`;
      chip.onclick = () => openModal("edit", ms);
      items.appendChild(chip);
    });
    grp.appendChild(items);
    $msList.appendChild(grp);
  });
}

function addMarker(type, x, label, extraLabel) {
  const mk = document.createElement("div");
  mk.className = "time-marker " + type;
  mk.style.left = x + "px";
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
    const rect = $track.getBoundingClientRect();
    const localX = e.clientX - rect.left - panX;
    const ts = xToTs(localX);
    const { year, week } = tsToWeek(ts);
    const ms = milestones.find(v => v.id === dragId);
    if (ms) { ms.year = year; ms.week = Math.max(1, Math.min(53, week)); render(); }
  }
});

window.addEventListener("mouseup", () => {
  if (dragId !== null) autoSave();
  isPanning = false; dragId = null;
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
  visibleTags = new Set();
  visibleStatuses = new Set(statuses.map(s => s.key));
  zoom = 1; panX = 0;
  autoSave();
  renderFilters(); render();
  showExportMsg("Timeline cleared");
};

/* double-click on timeline to add */
$track.addEventListener("dblclick", e => {
  if (e.target.closest(".ms")) return;
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
let modalMode = "add", modalMs = null, modalStatus = "planned", modalPeriod = "early";
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
  modalStatus = ms ? ms.status : "planned";

  let initYear, initMonth;
  if (ms) {
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

  renderPeriodPicks();
  updateWeekPreview();
  $year.onchange = updateWeekPreview;
  $month.onchange = updateWeekPreview;

  function updateWeekPreview() {
    const resolved = resolveToWeek();
    const wkStart = new Date(weekToTs(resolved.year, resolved.week));
    const wkEnd = new Date(wkStart.getTime() + 6 * 86400000);
    document.getElementById("weekPreview").textContent =
      `\u2192 W${resolved.week} ${resolved.year}  (${fmtPreviewDate(wkStart)} \u2013 ${fmtPreviewDate(wkEnd)})`;
  }

  function renderPeriodPicks() {
    const c = document.getElementById("fPeriod"); c.innerHTML = "";
    PERIODS.forEach(p => {
      const el = document.createElement("div");
      el.className = "period-pick" + (p.key === modalPeriod ? " active" : "");
      el.textContent = p.label;
      el.onclick = () => { modalPeriod = p.key; renderPeriodPicks(); updateWeekPreview(); };
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

  $modalBg._resolveToWeek = resolveToWeek;

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
    // add to dropdown and select it
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

  if (modalMode === "add") {
    milestones.push({ id: generateId(), year, week, title, desc, status: modalStatus, tag });
  } else if (modalMs) {
    Object.assign(modalMs, { title, desc, year, week, status: modalStatus, tag });
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

    const dateStr = parts[1];
    let month = -1, year = -1;

    const mMatch = dateStr.match(/^([a-z]+)\s+(\d{4})$/i);
    if (mMatch) {
      const mi = MONTH_MAP[mMatch[1].toLowerCase()];
      if (mi !== undefined) { month = mi; year = parseInt(mMatch[2]); }
    }
    if (month < 0) {
      const isoMatch = dateStr.match(/^(\d{4})-(\d{1,2})$/);
      if (isoMatch) { year = parseInt(isoMatch[1]); month = parseInt(isoMatch[2]) - 1; }
    }
    if (month < 0) {
      const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{4})$/);
      if (slashMatch) { month = parseInt(slashMatch[1]) - 1; year = parseInt(slashMatch[2]); }
    }
    if (month < 0) {
      const compactMatch = dateStr.match(/^(\d{2})(\d{4})$/);
      if (compactMatch) { month = parseInt(compactMatch[1]) - 1; year = parseInt(compactMatch[2]); }
    }

    if (month < 0 || month > 11 || year < 0) {
      results.push({ error: `Line ${lineIdx + 1}: can't parse date "${dateStr}"`, line });
      return;
    }

    const periodStr = (parts[2] || "mid").toLowerCase().trim();
    const periodMap = { early: 3, mid: 14, late: 24, e: 3, m: 14, l: 24 };
    const periodLabels = { early: "Early", mid: "Mid", late: "Late", e: "Early", m: "Mid", l: "Late" };
    const dayOffset = periodMap[periodStr] || 14;
    const periodLabel = periodLabels[periodStr] || "Mid";

    const tag = parts[3] || "";

    const statusStr = (parts[4] || "planned").toLowerCase().replace(/\s+/g, "");
    let statusKey = "planned";
    const found = statuses.find(s => s.key === statusStr || s.label.toLowerCase().replace(/\s+/g, "") === statusStr);
    if (found) statusKey = found.key;

    const target = new Date(year, month, dayOffset);
    const resolved = tsToWeek(target.getTime());

    results.push({
      ok: true,
      milestone: { title, desc: "", year: resolved.year, week: resolved.week, status: statusKey, tag },
      display: { title, month: MONTHS[month], year, period: periodLabel, tag, status: getStatusLabel(statusKey) }
    });
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
      html += `<span style="color:#eee;">${d.title}</span>`;
      html += `<span style="color:#666;">${d.period} ${d.month} ${d.year}</span>`;
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
    visibleTags = new Set(tags);
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
      visibleTags = new Set(tags);
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
