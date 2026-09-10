import { sql } from "drizzle-orm";
import type { Transaction } from "@/services/product";

export const id = "002_studio_reconciliation_indexes";

/** Partial indexes keep legacy dry-run reconciliation cheap without changing data. */
export async function up(tx: Transaction) {
  const statements = [
    sql`CREATE INDEX IF NOT EXISTS idx_studio_projects_unlinked ON studio_projects(id) WHERE project_id IS NULL`,
    sql`CREATE INDEX IF NOT EXISTS idx_studio_contracts_unlinked ON studio_contracts(studio_project_id) WHERE invoice_id IS NULL`,
    sql`CREATE INDEX IF NOT EXISTS idx_studio_payments_unlinked ON studio_project_payments(studio_project_id) WHERE payment_id IS NULL`,
    sql`CREATE INDEX IF NOT EXISTS idx_studio_expenses_unlinked ON studio_project_expenses(studio_project_id) WHERE expense_id IS NULL`,
    sql`CREATE INDEX IF NOT EXISTS idx_studio_salary_unlinked ON personnel_salary_records(studio_project_id) WHERE payment_status = 'paid' AND payment_id IS NULL`,
    sql`CREATE INDEX IF NOT EXISTS idx_studio_rentals_unlinked ON rental_equipment(studio_project_id) WHERE expense_id IS NULL`,
  ];
  for (const statement of statements) await tx.execute(statement);
}
