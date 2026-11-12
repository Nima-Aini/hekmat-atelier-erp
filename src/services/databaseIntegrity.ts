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
  ["DAILY_VISIT_INVALID_FINANCE_LINK", `SELECT COUNT(*)::int AS count FROM studio_daily_visits v LEFT JOIN customers c ON c.id=v.customer_id LEFT JOIN invoices i ON i.id=v.invoice_id WHERE v.status='active' AND v.financial_status='posted' AND (c.id IS NULL OR i.id IS NULL OR i.customer_id IS DISTINCT FROM v.customer_id)`],
  ["RESERVATION_INVALID_FINANCE_LINK", `SELECT COUNT(*)::int AS count FROM studio_reservations r LEFT JOIN customers c ON c.id=r.customer_id LEFT JOIN invoices i ON i.id=r.invoice_id WHERE r.status<>'cancelled' AND r.financial_status='posted' AND (c.id IS NULL OR i.id IS NULL OR i.customer_id IS DISTINCT FROM r.customer_id)`],
  ["EXPENSE_PAYMENT_ALLOCATION_INVALID", `SELECT COUNT(*)::int AS count FROM expense_payment_allocations a LEFT JOIN expenses e ON e.id=a.expense_id LEFT JOIN payments p ON p.id=a.payment_id WHERE e.id IS NULL OR p.id IS NULL OR p.status<>'completed' OR p.payment_type='customer_receipt'`],
  ["EXPENSE_PAID_AMOUNT_MISMATCH", `SELECT COUNT(*)::int AS count FROM expenses e LEFT JOIN (SELECT expense_id,SUM(allocated_amount) amount FROM expense_payment_allocations GROUP BY expense_id) a ON a.expense_id=e.id WHERE e.status='posted' AND ABS(e.paid_amount-COALESCE(a.amount,0))>0.009`],
  ["INVOICE_PAID_AMOUNT_MISMATCH", `SELECT COUNT(*)::int AS count FROM invoices i LEFT JOIN (SELECT invoice_id,SUM(allocated_amount) amount FROM payment_allocations GROUP BY invoice_id) a ON a.invoice_id=i.id WHERE i.status='issued' AND ABS(i.paid_amount-COALESCE(a.amount,0))>0.009`],
  ["ATELIER_EXPENSE_SOURCE_INVALID", `SELECT COUNT(*)::int AS count FROM atelier_expense_sources s LEFT JOIN expenses e ON e.id=s.expense_id WHERE e.id IS NULL OR s.source_type NOT IN ('personnel_wage','rental','direct_expense','general_expense')`],
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
