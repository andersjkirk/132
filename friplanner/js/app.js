/* UI logic, event binding, view routing for Friplanner. */

const state = {
  year: 2026,
  vacationDays: 25,
  unit: "days", // "days" | "weeks"
  fixedPeriod: null, // { start: Date, end: Date }
  selected: new Set(), // suggestion keys
  manualDays: new Set(), // user-picked individual vacation day keys
  showWholeYear: false,
  showAllPeriods: false, // also show plain weeks (non-bridge)
  view: "plan",
};

const els = {};

function $(id) {
  return document.getElementById(id);
}

function cacheEls() {
  els.yearSelect = $("year-select");
  els.vacationInput = $("vacation-input");
  els.unitHint = $("unit-conversion-hint");
  els.statUsed = $("stat-used");
  els.statOff = $("stat-off");
  els.statRatio = $("stat-ratio");
  els.fixedStart = $("fixed-start");
  els.fixedEnd = $("fixed-end");
  els.clearFixedBtn = $("clear-fixed-period");
  els.fixedPeriodResult = $("fixed-period-result");
  els.showWholeYear = $("show-whole-year");
  els.showAllPeriods = $("show-all-periods");
  els.suggestionsList = $("suggestions-list");
  els.calendarGrid = $("calendar-grid");
  els.savedPlansList = $("saved-plans-list");
  els.planNameInput = $("plan-name-input");
  els.savePlanBtn = $("save-plan-btn");
  els.savePlanFeedback = $("save-plan-feedback");
}

/* ---------- destinations ---------- */

const FLIGHT_ORIGIN = "Copenhagen";
const DESTINATIONS = [
  { name: "Barcelona", query: "Barcelona, Spanien", city: "Barcelona", emoji: "🏖️", meta: "Sol, strand & tapas", grad: "linear-gradient(135deg,#FF9A56,#FF6A88)" },
  { name: "Rom", query: "Rom, Italien", city: "Rome", emoji: "🏛️", meta: "Historie & is", grad: "linear-gradient(135deg,#F6A56B,#C9784B)" },
  { name: "Alperne", query: "Innsbruck, Østrig", city: "Innsbruck", emoji: "⛷️", meta: "Ski & sne", grad: "linear-gradient(135deg,#7FB8E8,#3E6FB0)" },
  { name: "Lissabon", query: "Lissabon, Portugal", city: "Lisbon", emoji: "🚋", meta: "Pastel & kyst", grad: "linear-gradient(135deg,#FFD37A,#F58C5A)" },
  { name: "Mallorca", query: "Mallorca, Spanien", city: "Palma de Mallorca", emoji: "🌊", meta: "Bugter & sol", grad: "linear-gradient(135deg,#56C8D8,#2A9CC0)" },
  { name: "København", query: "København, Danmark", city: null, emoji: "🚲", meta: "Hygge hjemme", grad: "linear-gradient(135deg,#67C7D8,#2A8FB0)" },
];
// shown inside each selected suggestion
const FEATURED_DESTINATIONS = [DESTINATIONS[0], DESTINATIONS[2], DESTINATIONS[3]];

function selectedPeriod() {
  const { days, all } = getAllSuggestions();
  const usedKeys = computeUsedKeys(days, all);
  if (!usedKeys.size) return null;
  // expand each used day across adjacent free days, then take overall span
  const usedDays = days.filter((d) => usedKeys.has(d.key));
  let start = usedDays[0].date, end = usedDays[0].date;
  for (const d of usedDays) {
    if (d.date < start) start = d.date;
    if (d.date > end) end = d.date;
  }
  // pull in neighbouring weekend/holiday days so the trip covers the full break
  const idx = (date) => days.findIndex((x) => x.key === Holidays.dateKey(date));
  let si = idx(start), ei = idx(end);
  while (si > 0 && days[si - 1].free) si--;
  while (ei < days.length - 1 && days[ei + 1].free) ei++;
  return { start: days[si].date, end: days[ei].date };
}

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function bookingUrl(query, period) {
  let url = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(query)}`;
  if (period) {
    const checkout = new Date(period.end);
    checkout.setDate(checkout.getDate() + 1); // night after the last day off
    url += `&checkin=${isoDate(period.start)}&checkout=${isoDate(checkout)}`;
  }
  return url;
}

function flightsUrl(city, period) {
  let q = `flights from ${FLIGHT_ORIGIN} to ${city}`;
  if (period) {
    const back = new Date(period.end);
    back.setDate(back.getDate() + 1);
    q += ` on ${isoDate(period.start)} returning ${isoDate(back)}`;
  }
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}`;
}


/* ---------- suggestion key helpers ---------- */

function suggestionKey(s) {
  return `${Holidays.dateKey(s.startDate)}_${Holidays.dateKey(s.endDate)}`;
}

/* ---------- core data assembly ---------- */

/* A plain week off (5 vacation days → 9 days off) is exactly 1.8 days off per
   vacation day. A real bridge day must beat that — i.e. a holiday is doing the
   work. Below we keep only those, and drop overlapping lesser-value ones so the
   list shows the single best option around each holiday. */
const PLAIN_WEEK_RATIO = 1.8;

function curateBridges(bridges) {
  const good = bridges
    .filter((s) => s.ratio > PLAIN_WEEK_RATIO + 1e-9)
    .sort((a, b) => b.ratio - a.ratio || b.daysOff - a.daysOff);
  const picked = [];
  for (const s of good) {
    const overlaps = picked.some(
      (p) => !(s.endIndex < p.startIndex || s.startIndex > p.endIndex)
    );
    if (!overlaps) picked.push(s);
  }
  return picked;
}

function getAllSuggestions() {
  const { days, suggestions } = BridgeLogic.findBridgeSuggestions(state.year);
  const bridges = suggestions.map((s) => ({ ...s, key: suggestionKey(s), source: "bridge" }));
  let all = state.showAllPeriods ? bridges : curateBridges(bridges);

  if (state.fixedPeriod) {
    const analysis = BridgeLogic.analyzeFixedPeriod(
      state.year,
      state.fixedPeriod.start,
      state.fixedPeriod.end
    );
    if (analysis) {
      const fixedSuggestion = {
        ...analysis.fixedPeriod,
        key: suggestionKey(analysis.fixedPeriod),
        source: "fixed",
        label: "Din faste periode",
      };
      const extensionSuggestions = analysis.extensions.map((e) => ({
        ...e,
        key: suggestionKey(e),
        source: "extension",
      }));
      all = [fixedSuggestion, ...extensionSuggestions, ...all];
    }
  }

  return { days, all };
}

function isPast(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

function visibleSuggestions(all) {
  const realYear = new Date().getFullYear();
  const filterPast = state.year === realYear && !state.showWholeYear;

  return all.filter((s) => {
    if (filterPast && isPast(s.endDate)) return false;
    return true;
  });
}

function budgetFilteredSuggestions(all) {
  const selectedList = all.filter((s) => state.selected.has(s.key));
  const totalSelectedCost = selectedList.reduce((sum, s) => sum + s.vacationDays, 0);

  return all.filter((s) => {
    const isSelected = state.selected.has(s.key);
    const remainingExcludingThis =
      state.vacationDays - totalSelectedCost + (isSelected ? s.vacationDays : 0);
    return isSelected || s.vacationDays <= remainingExcludingThis;
  });
}

/* ---------- rendering: plan / suggestions ---------- */

function formatDate(d) {
  return d.toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });
}

function renderUnitHint() {
  if (state.unit === "weeks") {
    const weeks = state.vacationDays / 5;
    els.unitHint.textContent = `${weeks.toFixed(weeks % 1 === 0 ? 0 : 1)} uger = ${state.vacationDays} dage (1 uge = 5 hverdage)`;
  } else {
    const weeks = state.vacationDays / 5;
    els.unitHint.textContent = `${state.vacationDays} dage ≈ ${weeks.toFixed(1)} uger`;
  }
}

function bump(el) {
  el.classList.remove("is-bumped");
  void el.offsetWidth;
  el.classList.add("is-bumped");
  setTimeout(() => el.classList.remove("is-bumped"), 260);
}

/* Unified set of spent vacation days = workdays inside selected suggestions
   plus the user's manually clicked days. */
function computeUsedKeys(days, all) {
  const usedKeys = new Set();
  for (const s of all) {
    if (!state.selected.has(s.key)) continue;
    for (let i = s.startIndex; i <= s.endIndex; i++) {
      if (!days[i].free) usedKeys.add(days[i].key);
    }
  }
  const freeKeys = new Set(days.filter((d) => d.free).map((d) => d.key));
  for (const key of state.manualDays) {
    if (!freeKeys.has(key)) usedKeys.add(key);
  }
  return usedKeys;
}

/* Total consecutive days off: every stretch of free/used days that contains
   at least one spent vacation day counts in full. */
function computeDaysOff(days, usedKeys) {
  const isOff = (d) => d.free || usedKeys.has(d.key);
  let total = 0, i = 0;
  while (i < days.length) {
    if (!isOff(days[i])) { i++; continue; }
    let j = i, hasUsed = false;
    while (j < days.length && isOff(days[j])) {
      if (usedKeys.has(days[j].key)) hasUsed = true;
      j++;
    }
    if (hasUsed) total += j - i;
    i = j;
  }
  return total;
}

function renderStats(days, all) {
  const usedKeys = computeUsedKeys(days, all);
  const used = usedKeys.size;
  const off = computeDaysOff(days, usedKeys);
  const ratio = used > 0 ? off / used : 0;

  const fx = window.FX;
  if (fx) {
    if (els.statUsed.dataset.fxValue !== String(used)) bump(els.statUsed);
    if (els.statOff.dataset.fxValue !== String(off)) bump(els.statOff);
    fx.countUp(els.statUsed, used);
    fx.countUp(els.statOff, off);
    if (used > 0) fx.countUp(els.statRatio, ratio, { decimals: 1 });
    else { els.statRatio.dataset.fxValue = "0"; els.statRatio.textContent = "–"; }
  } else {
    els.statUsed.textContent = used;
    els.statOff.textContent = off;
    els.statRatio.textContent = used > 0 ? ratio.toFixed(1) : "–";
  }
}

function renderSuggestions() {
  const { days, all } = getAllSuggestions();
  const afterPast = visibleSuggestions(all);
  const afterBudget = budgetFilteredSuggestions(afterPast)
    .slice()
    .sort((a, b) => a.startDate - b.startDate); // chronological, from today forward

  renderStats(days, all);

  if (afterBudget.length === 0) {
    els.suggestionsList.innerHTML = `<p class="hint">Ingen forslag matcher lige nu. Prøv at vise hele året, eller justér dine feriedage.</p>`;
    return;
  }

  // the single best-value bridge among what's shown
  const bestRatio = Math.max(
    0,
    ...afterBudget.filter((s) => s.source === "bridge").map((s) => s.ratio)
  );

  els.suggestionsList.innerHTML = afterBudget
    .map((s) => {
      const checked = state.selected.has(s.key) ? "checked" : "";
      const tag =
        s.source === "fixed" ? "Fast periode" : s.source === "extension" ? "Forlængelse" : "Bro-dage";
      const isBest = s.source === "bridge" && s.ratio === bestRatio && bestRatio > 0;
      const trips = state.selected.has(s.key) ? renderTrips(s) : "";
      return `
        <article class="suggestion-card${isBest ? " is-best" : ""}" data-key="${s.key}">
          ${isBest ? `<div class="best-badge">⭐ Bedste for dine feriedage</div>` : ""}
          <div class="suggestion-top">
            <label class="suggestion-checkbox">
              <input type="checkbox" data-select-key="${s.key}" ${checked} />
            </label>
            <div class="suggestion-body" data-jump-key="${s.key}">
              <div class="suggestion-tag">${tag}</div>
              <div class="suggestion-dates">${formatDate(s.startDate)} – ${formatDate(s.endDate)}</div>
              <div class="suggestion-metrics">
                <span><strong>${s.daysOff}</strong> fridage</span>
                <span><strong>${s.vacationDays}</strong> feriedage</span>
                <span class="ratio-pill">${s.ratio.toFixed(1)}×</span>
              </div>
            </div>
          </div>
          ${trips}
        </article>
      `;
    })
    .join("");
}

/* Travel options shown inside a selected suggestion, with hotel + flight
   links pre-filled with that suggestion's dates. */
function renderTrips(s) {
  const period = { start: s.startDate, end: s.endDate };
  const rows = FEATURED_DESTINATIONS.map((d) => {
    const hotel = `<a class="trip-hotel" href="${bookingUrl(d.query, period)}" target="_blank" rel="noopener">🏨 Hotel</a>`;
    const fly = d.city
      ? `<a class="trip-fly" href="${flightsUrl(d.city, period)}" target="_blank" rel="noopener">✈️ Fly</a>`
      : "";
    return `
      <div class="trip">
        <div class="trip-ico" style="background:${d.grad}">${d.emoji}</div>
        <div class="trip-who">
          <div class="trip-name">${d.name}</div>
          <div class="trip-meta">Fly + hotel i dine datoer — se priser</div>
        </div>
        <div class="trip-actions">${hotel}${fly}</div>
      </div>`;
  }).join("");
  return `<div class="trips"><div class="trips-title">✈️ Rejs i denne periode</div>${rows}</div>`;
}

function renderFixedPeriodResult() {
  if (!state.fixedPeriod) {
    els.fixedPeriodResult.innerHTML = "";
    return;
  }
  const analysis = BridgeLogic.analyzeFixedPeriod(
    state.year,
    state.fixedPeriod.start,
    state.fixedPeriod.end
  );
  if (!analysis) {
    els.fixedPeriodResult.innerHTML = `<p class="hint">Perioden ligger uden for det valgte år.</p>`;
    return;
  }
  const fp = analysis.fixedPeriod;
  els.fixedPeriodResult.innerHTML = `
    <p class="fixed-period-summary">
      Kræver <strong>${fp.vacationDays}</strong> feriedage for <strong>${fp.daysOff}</strong> dage fri
      (${formatDate(fp.startDate)} – ${formatDate(fp.endDate)}).
    </p>
  `;
}

/* ---------- rendering: calendar ---------- */

function renderCalendar() {
  const { days, all } = getAllSuggestions();
  const vacationDayKeys = computeUsedKeys(days, all);

  const months = [];
  for (let m = 0; m < 12; m++) months.push([]);
  for (const day of days) months[day.date.getMonth()].push(day);

  const monthNames = [
    "Januar", "Februar", "Marts", "April", "Maj", "Juni",
    "Juli", "August", "September", "Oktober", "November", "December",
  ];

  els.calendarGrid.innerHTML = months
    .map((monthDays, i) => {
      const firstWeekday = (monthDays[0].date.getDay() + 6) % 7; // Monday = 0
      const blanks = Array.from({ length: firstWeekday }).map(() => `<div class="cal-day cal-blank"></div>`);
      const cells = monthDays.map((day) => {
        let cls = "cal-day";
        if (vacationDayKeys.has(day.key)) cls += " cal-day-selected";
        else if (day.isHoliday) cls += " cal-day-holiday";
        else if (day.isWeekend) cls += " cal-day-weekend";
        else cls += " cal-day-normal";
        const title = day.holidayName ? ` title="${day.holidayName}"` : "";
        return `<div class="${cls}" data-day-key="${day.key}" data-free="${day.free ? 1 : 0}"${title}>${day.date.getDate()}</div>`;
      });
      return `
        <div class="cal-month fx-reveal" id="cal-month-${i}">
          <h3>${monthNames[i]}</h3>
          <div class="cal-weekdays">
            <span>Ma</span><span>Ti</span><span>On</span><span>To</span><span>Fr</span><span>Lø</span><span>Sø</span>
          </div>
          <div class="cal-days">${blanks.join("")}${cells.join("")}</div>
        </div>
      `;
    })
    .join("");

  if (window.FX) window.FX.observeReveals(els.calendarGrid);
}

/* ---------- single-page navigation (scroll shortcuts) ---------- */

function setView(view) {
  state.view = view;
  const section = document.getElementById(`view-${view}`);
  if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
}

// highlight the nav button for the section currently in view
function initScrollSpy() {
  const sections = document.querySelectorAll(".view");
  const spy = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          const v = e.target.dataset.view;
          document.querySelectorAll(".nav-btn").forEach((b) =>
            b.classList.toggle("is-active", b.dataset.view === v)
          );
        }
      });
    },
    { rootMargin: "-45% 0px -45% 0px" }
  );
  sections.forEach((s) => spy.observe(s));
}

function jumpToSuggestion(key) {
  const { all } = getAllSuggestions();
  const suggestion = all.find((s) => s.key === key);
  if (!suggestion) return;
  const monthEl = $(`cal-month-${suggestion.startDate.getMonth()}`);
  if (monthEl) monthEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------- saved plans ---------- */

function renderSavedPlans() {
  const plans = Storage.loadPlans().filter((p) => true);
  if (plans.length === 0) {
    els.savedPlansList.innerHTML = `<p class="hint">Du har ikke gemt nogen planer endnu.</p>`;
    return;
  }
  els.savedPlansList.innerHTML = plans
    .slice()
    .reverse()
    .map(
      (p) => `
      <div class="saved-plan-row" data-plan-id="${p.id}">
        <div>
          <div class="saved-plan-name">${escapeHtml(p.name)}</div>
          <div class="saved-plan-meta">${p.year} · ${p.vacationDays} feriedage · ${p.selectedKeys.length} valgte forslag</div>
        </div>
        <div class="saved-plan-actions">
          <button type="button" class="btn-secondary" data-load-plan="${p.id}">Indlæs</button>
          <button type="button" class="btn-danger" data-delete-plan="${p.id}">Slet</button>
        </div>
      </div>
    `
    )
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function loadPlan(id) {
  const plan = Storage.loadPlans().find((p) => p.id === id);
  if (!plan) return;
  state.year = plan.year;
  state.vacationDays = plan.vacationDays;
  state.fixedPeriod = plan.fixedPeriod
    ? { start: new Date(plan.fixedPeriod.start), end: new Date(plan.fixedPeriod.end) }
    : null;
  state.selected = new Set(plan.selectedKeys);
  state.manualDays = new Set(plan.manualDays || []);

  els.yearSelect.value = String(state.year);
  els.vacationInput.value = state.vacationDays;
  els.fixedStart.value = state.fixedPeriod ? toInputDate(state.fixedPeriod.start) : "";
  els.fixedEnd.value = state.fixedPeriod ? toInputDate(state.fixedPeriod.end) : "";

  renderAll();
  setView("plan");
}

function toInputDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ---------- render everything ---------- */

function renderAll() {
  renderUnitHint();
  renderFixedPeriodResult();
  renderSuggestions();
  renderCalendar();
}

/* ---------- event binding ---------- */

function bindEvents() {
  els.yearSelect.addEventListener("change", () => {
    state.year = Number(els.yearSelect.value);
    state.selected = new Set();
    state.manualDays = new Set();
    renderAll();
  });

  els.vacationInput.addEventListener("input", () => {
    const val = Number(els.vacationInput.value) || 0;
    state.vacationDays = state.unit === "weeks" ? val * 5 : val;
    renderAll();
  });

  document.querySelectorAll(".unit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const newUnit = btn.dataset.unit;
      if (newUnit === state.unit) return;
      document.querySelectorAll(".unit-btn").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      if (newUnit === "weeks") {
        els.vacationInput.value = (state.vacationDays / 5).toFixed(1);
      } else {
        els.vacationInput.value = state.vacationDays;
      }
      state.unit = newUnit;
      renderUnitHint();
    });
  });

  els.fixedStart.addEventListener("change", updateFixedPeriod);
  els.fixedEnd.addEventListener("change", updateFixedPeriod);

  els.clearFixedBtn.addEventListener("click", () => {
    state.fixedPeriod = null;
    els.fixedStart.value = "";
    els.fixedEnd.value = "";
    renderAll();
  });

  els.showWholeYear.addEventListener("change", () => {
    state.showWholeYear = els.showWholeYear.checked;
    renderSuggestions();
  });

  els.showAllPeriods.addEventListener("change", () => {
    state.showAllPeriods = els.showAllPeriods.checked;
    renderSuggestions();
    renderCalendar();
  });

  els.suggestionsList.addEventListener("change", (e) => {
    const key = e.target.dataset.selectKey;
    if (!key) return;
    if (e.target.checked) {
      state.selected.add(key);
    } else {
      state.selected.delete(key);
    }
    renderSuggestions();
    renderCalendar(); // reflect picked bridge days on the calendar immediately
  });

  // click a calendar day to pick/unpick your own vacation day
  els.calendarGrid.addEventListener("click", (e) => {
    const cell = e.target.closest("[data-day-key]");
    if (!cell || cell.dataset.free === "1") return; // only workdays are pickable
    const key = cell.dataset.dayKey;
    if (state.manualDays.has(key)) {
      state.manualDays.delete(key);
    } else {
      state.manualDays.add(key);
    }
    renderCalendar();
    renderSuggestions();
  });

  els.suggestionsList.addEventListener("click", (e) => {
    const jumpEl = e.target.closest("[data-jump-key]");
    if (!jumpEl) return;
    jumpToSuggestion(jumpEl.dataset.jumpKey);
  });

  els.savePlanBtn.addEventListener("click", () => {
    const name = els.planNameInput.value.trim();
    if (!name) {
      els.savePlanFeedback.textContent = "Giv din plan et navn først.";
      return;
    }
    Storage.savePlan({
      name,
      year: state.year,
      vacationDays: state.vacationDays,
      fixedPeriod: state.fixedPeriod
        ? { start: state.fixedPeriod.start.toISOString(), end: state.fixedPeriod.end.toISOString() }
        : null,
      selectedKeys: Array.from(state.selected),
      manualDays: Array.from(state.manualDays),
    });
    els.savePlanFeedback.textContent = `Plan “${name}” gemt.`;
    els.planNameInput.value = "";
    renderSavedPlans();
  });

  els.savedPlansList.addEventListener("click", (e) => {
    const loadId = e.target.dataset.loadPlan;
    const deleteId = e.target.dataset.deletePlan;
    if (loadId) loadPlan(loadId);
    if (deleteId) {
      Storage.deletePlan(deleteId);
      renderSavedPlans();
    }
  });

  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });
}

function updateFixedPeriod() {
  const startVal = els.fixedStart.value;
  const endVal = els.fixedEnd.value;
  if (!startVal || !endVal) {
    state.fixedPeriod = null;
  } else {
    const start = new Date(startVal);
    const end = new Date(endVal);
    if (end < start) {
      state.fixedPeriod = null;
    } else {
      state.fixedPeriod = { start, end };
    }
  }
  renderAll();
}

/* ---------- init ---------- */

function init() {
  cacheEls();
  bindEvents();

  // single page: render every section up front
  renderAll();
  renderSavedPlans();
  initScrollSpy();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
}

document.addEventListener("DOMContentLoaded", init);
