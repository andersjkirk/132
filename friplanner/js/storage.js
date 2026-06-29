/* localStorage save/load for plans. */

const STORAGE_KEY = "friplanner.plans";

function loadPlans() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function savePlan(plan) {
  const plans = loadPlans();
  const record = {
    id: plan.id || `plan-${Date.now()}`,
    name: plan.name,
    year: plan.year,
    vacationDays: plan.vacationDays,
    fixedPeriod: plan.fixedPeriod || null,
    selectedKeys: plan.selectedKeys || [],
    manualDays: plan.manualDays || [],
    savedAt: new Date().toISOString(),
  };
  const existingIndex = plans.findIndex((p) => p.id === record.id);
  if (existingIndex >= 0) plans[existingIndex] = record;
  else plans.push(record);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
  return record;
}

function deletePlan(id) {
  const plans = loadPlans().filter((p) => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
}

window.Storage = { loadPlans, savePlan, deletePlan };
