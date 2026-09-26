export const ATELIER_NAVIGATION_PERMISSION: Record<string, string> = {
  dashboard: "studio.dashboard.view",
  contracts: "studio.contract.view",
  daily_visits: "studio.daily_visits.view",
  reservations: "studio.reservations.view",
  planning: "studio.planning.view",
  calendar: "studio.calendar.view",
  customers: "studio.customers.view",
  personnel: "studio.personnel.view",
  equipment: "studio.equipment.view",
  finance: "studio.finance.view",
  notifications: "studio.notifications.view",
  ai: "ai.view",
  settings: "settings.view",
};

export function canSeeAtelierSection(
  sectionId: string,
  permissionValues: Iterable<string>,
) {
  const permissions = new Set(permissionValues);
  if (permissions.has("*")) return true;
  if (permissions.has(ATELIER_NAVIGATION_PERMISSION[sectionId] || "")) return true;
  return sectionId !== "ai" && sectionId !== "settings" && permissions.has("studio.view");
}

export function visibleAtelierSections(
  sectionIds: readonly string[],
  permissionValues: Iterable<string>,
) {
  return sectionIds.filter((id) => canSeeAtelierSection(id, permissionValues));
}
