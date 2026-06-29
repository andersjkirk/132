/* UI logic, event binding, view routing for Friplanner. */

const state = {
  year: 2026,
  vacationDays: 25,
  unit: "days", // "days" | "weeks"
  fixedPeriod: null, // { start: Date, end: Date }
  selected: new Set(), // suggestion keys
  manualDays: new Set(), // user-picked individual vacation day keys
  showWholeYear: false,
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
  els.suggestionsList = $("suggestions-list");
  els.calendarGrid = $("calendar-grid");
  els.savedPlansList = $("saved-plans-list");
  els.planNameInput = $("plan-name-input");
  els.savePlanBtn = $("save-plan-btn");
  els.savePlanFeedback = $("save-plan-feedback");
  els.destinationsList = $("destinations-list");
  els.destinationsHint = $("destinations-hint");
}

/* ---------- destinations ---------- */

const DESTINATIONS = [
  { name: "Barcelona", query: "Barcelona, Spanien", emoji: "🏖️", meta: "Sol, strand & tapas", grad: "linear-gradient(135deg,#FF9A56,#FF6A88)" },
  { name: "Rom", query: "Rom, Italien", emoji: "🏛️", meta: "Historie & is", grad: "linear-gradient(135deg,#F6A56B,#C9784B)" },
  { name: "Alperne", query: "Alperne, Østrig", emoji: "⛷️", meta: "Ski & sne", grad: "linear-gradient(135deg,#7FB8E8,#3E6FB0)" },
  { name: "Lissabon", query: "Lissabon, Portugal", emoji: "🚋", meta: "Pastel & kyst", grad: "linear-gradient(135deg,#FFD37A,#F58C5A)" },
  { name: "København", query: "København, Danmark", emoji: "🚲", meta: "Hygge hjemme", grad: "linear-gradient(135deg,#67C7D8,#2A8FB0)" },
  { name: "Mallorca", query: "Mallorca, Spanien", emoji: "🌊", meta: "Bugter & sol", grad: "linear-gradient(135deg,#56C8D8,#2A9CC0)" },
];

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

function renderDestinations() {
  const period = selectedPeriod();
  if (els.destinationsHint) {
    els.destinationsHint.textContent = period
      ? `Rejser i din valgte periode: ${formatDate(period.start)} – ${formatDate(period.end)}. Tryk og book.`
      : "Vælg et forslag ovenfor — så finder vi rejser præcis i de datoer.";
  }
  els.destinationsList.innerHTML = DESTINATIONS.map((d) => `
    <a class="destination-card" href="${bookingUrl(d.query, period)}" target="_blank" rel="noopener"
       style="background-image:${d.grad}">
      <span class="destination-emoji">${d.emoji}</span>
      <span class="destination-cta">${period ? "Book" : "Se rejser"}</span>
      <span class="destination-name">${d.name}</span>
      <span class="destination-meta">${d.meta}</span>
    </a>
  `).join("");
}

/* ---------- suggestion key helpers ---------- */

function suggestionKey(s) {
  return `${Holidays.dateKey(s.startDate)}_${Holidays.dateKey(s.endDate)}`;
}

/* ---------- core data assembly ---------- */

function getAllSuggestions() {
  const { days, suggestions } = BridgeLogic.findBridgeSuggestions(state.year);
  let all = suggestions.map((s) => ({ ...s, key: suggestionKey(s), source: "bridge" }));

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
  const afterBudget = budgetFilteredSuggestions(afterPast);

  renderStats(days, all);

  if (afterBudget.length === 0) {
    els.suggestionsList.innerHTML = `<p class="hint">Ingen forslag matcher lige nu. Prøv at vise hele året, eller justér dine feriedage.</p>`;
    return;
  }

  els.suggestionsList.innerHTML = afterBudget
    .map((s) => {
      const checked = state.selected.has(s.key) ? "checked" : "";
      const tag =
        s.source === "fixed" ? "Fast periode" : s.source === "extension" ? "Forlængelse" : "Bro-dage";
      return `
        <article class="suggestion-card" data-key="${s.key}">
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
        </article>
      `;
    })
    .join("");
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

/* ---------- view routing ---------- */

function setView(view, { pushHistory = true } = {}) {
  state.view = view;
  document.querySelectorAll(".view").forEach((v) => {
    v.classList.toggle("is-active", v.dataset.view === view);
  });
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.view === view);
  });
  document.querySelector(".app-main").classList.toggle("is-saved-active", view === "saved");
  if (pushHistory) {
    history.pushState({ view }, "", `#${view}`);
  }
  if (view === "calendar") renderCalendar();
  if (view === "saved") renderSavedPlans();
  if (window.FX) requestAnimationFrame(() => window.FX.observeReveals());
}

function jumpToSuggestion(key) {
  const { all } = getAllSuggestions();
  const suggestion = all.find((s) => s.key === key);
  if (!suggestion) return;
  setView("calendar");
  requestAnimationFrame(() => {
    const monthEl = $(`cal-month-${suggestion.startDate.getMonth()}`);
    if (monthEl) monthEl.scrollIntoView({ behavior: "smooth", block: "start" });
  });
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
  renderDestinations();
  if (state.view === "calendar") renderCalendar();
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

  els.suggestionsList.addEventListener("change", (e) => {
    const key = e.target.dataset.selectKey;
    if (!key) return;
    if (e.target.checked) {
      state.selected.add(key);
      // celebrate a great-value pick
      const { all } = getAllSuggestions();
      const picked = all.find((s) => s.key === key);
      if (window.FX && picked && picked.ratio >= 2) {
        const rect = e.target.getBoundingClientRect();
        window.FX.confetti(rect.left + rect.width / 2, rect.top + rect.height / 2,
          picked.ratio >= 3 ? 110 : 70);
      }
    } else {
      state.selected.delete(key);
    }
    renderSuggestions();
    renderDestinations();
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
    renderDestinations();
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

  window.addEventListener("popstate", (e) => {
    const view = (e.state && e.state.view) || "plan";
    setView(view, { pushHistory: false });
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

  const initialView = (location.hash || "#plan").replace("#", "");
  setView(["plan", "calendar", "saved"].includes(initialView) ? initialView : "plan", {
    pushHistory: false,
  });

  renderAll();
  // desktop shows calendar side-by-side, so populate it up front
  renderCalendar();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
}

document.addEventListener("DOMContentLoaded", init);
