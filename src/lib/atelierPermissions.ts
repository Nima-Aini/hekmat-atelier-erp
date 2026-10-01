/** One-way compatibility: a legacy manager keeps capabilities, a narrow grant never grants manage. */
export const GRANULAR_PERMISSION_PARENTS: Record<string, string[]> = {
  ...Object.fromEntries(["create", "edit", "approve", "cancel", "delete_draft"].map(action => [`studio.contract.${action}`, ["studio.contract.manage"]])),
  ...Object.fromEntries(["create", "edit", "delete"].map(action => [`studio.customers.${action}`, ["studio.customers.manage", "studio.contract.manage"]])),
  ...Object.fromEntries(["create", "edit", "delete", "view_all"].map(action => [`studio.reservations.${action}`, ["studio.reservations.manage"]])),
  ...Object.fromEntries(["create_receipt", "create_expense", "refund", "accounts"].map(action => [`studio.finance.${action}`, ["studio.finance.manage"]])),
  "studio.personnel.finance.view": ["studio.personnel.wage.view", "studio.finance.view", "studio.finance.manage"],
  "studio.personnel.finance.pay": ["studio.finance.manage"],
  "studio.equipment.maintenance": ["studio.equipment.manage"],
  "studio.finance.reports": ["studio.finance.manage"],
  "studio.finance.profit_view": ["studio.finance.manage"],
  "settings.manage": ["admin.settings"],
  "reports.view": ["studio.reports.view"],
  "reports.export": ["studio.reports.export"],
  "ai.use": ["ai.view"],
  "ai.view": ["ai.use"],
};

export function hasAtelierPermission(values: Iterable<string>, permission: string) {
  const granted = new Set(values);
  return granted.has("*") || granted.has(permission) || (GRANULAR_PERMISSION_PARENTS[permission] || []).some(parent => granted.has(parent));
}

export function hasScopedAtelierPermission(values: Iterable<string>, permission: string, scoped: Record<string, unknown>) {
  if (scoped[permission] === false) return false;
  if (scoped[permission] === true) return true;
  const parents = GRANULAR_PERMISSION_PARENTS[permission] || [];
  if (parents.some(parent => scoped[parent] === false)) return false;
  return hasAtelierPermission(values, permission) || parents.some(parent => scoped[parent] === true);
}
