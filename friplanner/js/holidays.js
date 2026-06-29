/* Danish public holidays, 2026-2028. Store Bededag was abolished from 2024 and is intentionally excluded. */

const EASTER_SUNDAY = {
  2026: { month: 4, day: 5 },
  2027: { month: 3, day: 28 },
  2028: { month: 4, day: 16 },
};

function addDays(year, month, day, offset) {
  const d = new Date(year, month - 1, day);
  d.setDate(d.getDate() + offset);
  return d;
}

function getHolidays(year) {
  const easter = EASTER_SUNDAY[year];
  if (!easter) return [];

  const easterSunday = new Date(year, easter.month - 1, easter.day);

  const fromEaster = (offset) => addDays(year, easter.month, easter.day, offset);

  const holidays = [
    { date: new Date(year, 0, 1), name: "Nytårsdag" },
    { date: fromEaster(-3), name: "Skærtorsdag" },
    { date: fromEaster(-2), name: "Langfredag" },
    { date: easterSunday, name: "Påskedag" },
    { date: fromEaster(1), name: "2. Påskedag" },
    { date: fromEaster(39), name: "Kristi Himmelfartsdag" },
    { date: fromEaster(49), name: "Pinsedag" },
    { date: fromEaster(50), name: "2. Pinsedag" },
    { date: new Date(year, 11, 25), name: "Juledag" },
    { date: new Date(year, 11, 26), name: "2. Juledag" },
  ];

  return holidays;
}

function getHolidayMap(year) {
  const map = new Map();
  for (const h of getHolidays(year)) {
    map.set(dateKey(h.date), h.name);
  }
  return map;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

window.Holidays = { getHolidays, getHolidayMap, dateKey };
