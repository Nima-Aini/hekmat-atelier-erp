type Queryable = { query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }> };

export type IntegrityIssue = { code: string; count: number };

const CHECKS: Array<[string, string]> = [
  ["STUDIO_PROJECT_WITHOUT_CORE", `SELECT COUNT(*)::int AS count FROM studio_projects WHERE project_id IS NULL`],
  ["CONTRACT_INVALID_INVOICE", `SELECT COUNT(*)::int AS count FROM studio_contracts s LEFT JOIN invoices i ON i.id=s.invoice_id WHERE s.invoice_id IS NOT NULL AND i.id IS NULL`],
  ["CONTRACT_PROJECT_MISMATCH", `SELECT COUNT(*)::int AS count FROM studio_contracts c JOIN studio_projects s ON s.id=c.studio_project_id JOIN invoices i ON i.id=c.invoice_id WHERE i.project_id IS DISTINCT FROM s.project_id`],
  ["PAYMENT_INVALID_CANONICAL", `SELECT COUNT(*)::int AS count FROM studio_project_payments s LEFT JOIN payments p ON p.id=s.payment_id WHERE s.payment_id IS NOT NULL AND p.id IS NULL`],
  ["PAYMENT_PROJECT_MISMATCH", `SELECT COUNT(*)::int AS count FROM studio_project_payments x JOIN studio_projects s ON s.id=x.studio_project_id JOIN payments p ON p.id=x.payment_id WHERE p.project_id IS DISTINCT FROM s.project_id`],
  ["EXPENSE_INVALID_CANONICAL", `SELECT COUNT(*)::int AS count FROM studio_project_expenses s LEFT JOIN expenses e ON e.id=s.expense_id WHERE s.expense_id IS NOT NULL AND e.id IS NULL`],
  ["EXPENSE_PROJECT_MISMATCH", `SELECT COUNT(*)::int AS count FROM studio_project_expenses x JOIN studio_projects s ON s.id=x.studio_project_id JOIN expenses e ON e.id=x.expense_id WHERE e.project_id IS DISTINCT FROM s.project_id`],
  ["PAID_WAGE_WITHOUT_PAYMENT", `SELECT COUNT(*)::int AS count FROM personnel_salary_records WHERE payment_status='paid' AND payment_id IS NULL`],
  ["RENTAL_WITHOUT_EXPENSE", `SELECT COUNT(*)::int AS count FROM rental_equipment WHERE studio_project_id IS NOT NULL AND financial_status='posted' AND expense_id IS NULL`],
  ["ORPHAN_RESERVATION", `SELECT COUNT(*)::int AS count FROM equipment_reservations r LEFT JOIN studio_projects p ON p.id=r.studio_project_id WHERE r.studio_project_id IS NOT NULL AND p.id IS NULL`],
  ["ORPHAN_PRODUCTION_PLAN", `SELECT COUNT(*)::int AS count FROM studio_production_plans x LEFT JOIN studio_projects p ON p.id=x.studio_project_id WHERE p.id IS NULL`],
  ["ORPHAN_PRODUCTION_STEP", `SELECT COUNT(*)::int AS count FROM studio_production_steps x LEFT JOIN studio_production_plans p ON p.id=x.plan_id WHERE p.id IS NULL`],
  ["ORPHAN_CALENDAR_EVENT", `SELECT COUNT(*)::int AS count FROM studio_calendar_events x LEFT JOIN studio_projects p ON p.id=x.studio_project_id WHERE x.studio_project_id IS NOT NULL AND p.id IS NULL`],
  ["INVALID_PROJECT_SCOPE_LINK", `SELECT COUNT(*)::int AS count FROM studio_projects s LEFT JOIN projects p ON p.id=s.project_id WHERE s.project_id IS NOT NULL AND p.id IS NULL`],
];

export async function verifyDatabaseIntegrity(client: Queryable) {
  const issues: IntegrityIssue[] = [];
  for (const [code, query] of CHECKS) {
    const result = await client.query(query);
    const count = Number(result.rows[0]?.count || 0);
    if (count) issues.push({ code, count });
  }
  return { valid: issues.length === 0, checkedAt: new Date().toISOString(), issues };
}
