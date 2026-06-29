/* Core bridge-day algorithm: find periods where weekends + holidays can be
   connected into one stretch of consecutive days off by spending a small
   number of vacation days. */

function isWeekend(date) {
  const d = date.getDay();
  return d === 0 || d === 6;
}

function buildYearDays(year) {
  const holidayMap = Holidays.getHolidayMap(year);
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  const days = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const date = new Date(d);
    const key = Holidays.dateKey(date);
    const holidayName = holidayMap.get(key) || null;
    days.push({
      date,
      key,
      isWeekend: isWeekend(date),
      isHoliday: !!holidayName,
      holidayName,
      free: isWeekend(date) || !!holidayName,
    });
  }
  return days;
}

function findClusterBoundaries(days) {
  const starts = [];
  const ends = [];
  for (let i = 0; i < days.length; i++) {
    if (!days[i].free) continue;
    if (i === 0 || !days[i - 1].free) starts.push(i);
    if (i === days.length - 1 || !days[i + 1].free) ends.push(i);
  }
  return { starts, ends };
}

function findBridgeSuggestions(year, maxVacationDays = 9) {
  const days = buildYearDays(year);
  const { starts, ends } = findClusterBoundaries(days);

  const candidates = [];

  for (const s of starts) {
    let vacation = 0;
    for (let e = s; e < days.length; e++) {
      if (!days[e].free) vacation++;
      if (vacation > maxVacationDays) break;
      if (!days[e].free) continue;
      // only record when e is a valid cluster end boundary
      if (ends.includes(e) && vacation > 0) {
        const daysOff = e - s + 1;
        candidates.push({
          startIndex: s,
          endIndex: e,
          startDate: days[s].date,
          endDate: days[e].date,
          vacationDays: vacation,
          daysOff,
          ratio: daysOff / vacation,
        });
      }
    }
  }

  // de-duplicate strictly-nested candidates with identical ratio/cost is fine to keep;
  // sort best-ratio first, then by total days off.
  candidates.sort((a, b) => b.ratio - a.ratio || b.daysOff - a.daysOff);

  return { days, suggestions: candidates };
}

function describeSuggestion(suggestion) {
  const fmt = (d) =>
    d.toLocaleDateString("da-DK", { day: "numeric", month: "short" });
  return `${fmt(suggestion.startDate)} – ${fmt(suggestion.endDate)}`;
}

function workdaysBetween(days, startIndex, endIndex) {
  let count = 0;
  for (let i = startIndex; i <= endIndex; i++) {
    if (!days[i].free) count++;
  }
  return count;
}

function findIndexForDate(days, date) {
  const key = Holidays.dateKey(date);
  return days.findIndex((d) => d.key === key);
}

/* Given a fixed user-chosen date range, compute the vacation days it actually
   requires, plus a small set of cheap extension suggestions on either side. */
function analyzeFixedPeriod(year, startDate, endDate, maxExtraVacation = 4) {
  const days = buildYearDays(year);
  const startIndex = findIndexForDate(days, startDate);
  const endIndex = findIndexForDate(days, endDate);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) return null;

  const vacationDays = workdaysBetween(days, startIndex, endIndex);
  const daysOff = endIndex - startIndex + 1;

  const { starts, ends } = findClusterBoundaries(days);

  const extensions = [];

  // try extending backwards from startIndex to an earlier cluster start
  for (const s of starts) {
    if (s >= startIndex) continue;
    const extra = workdaysBetween(days, s, startIndex - 1);
    if (extra === 0 || extra > maxExtraVacation) continue;
    extensions.push({
      startIndex: s,
      endIndex,
      startDate: days[s].date,
      endDate: days[endIndex].date,
      vacationDays: vacationDays + extra,
      daysOff: endIndex - s + 1,
      ratio: (endIndex - s + 1) / (vacationDays + extra),
      label: "Forlæng start",
    });
  }

  // try extending forwards from endIndex to a later cluster end
  for (const e of ends) {
    if (e <= endIndex) continue;
    const extra = workdaysBetween(days, endIndex + 1, e);
    if (extra === 0 || extra > maxExtraVacation) continue;
    extensions.push({
      startIndex,
      endIndex: e,
      startDate: days[startIndex].date,
      endDate: days[e].date,
      vacationDays: vacationDays + extra,
      daysOff: e - startIndex + 1,
      ratio: (e - startIndex + 1) / (vacationDays + extra),
      label: "Forlæng slut",
    });
  }

  extensions.sort((a, b) => b.ratio - a.ratio);

  return {
    days,
    fixedPeriod: {
      startIndex,
      endIndex,
      startDate: days[startIndex].date,
      endDate: days[endIndex].date,
      vacationDays,
      daysOff,
      ratio: vacationDays > 0 ? daysOff / vacationDays : Infinity,
    },
    extensions: extensions.slice(0, 4),
  };
}

window.BridgeLogic = {
  buildYearDays,
  findBridgeSuggestions,
  describeSuggestion,
  analyzeFixedPeriod,
};
