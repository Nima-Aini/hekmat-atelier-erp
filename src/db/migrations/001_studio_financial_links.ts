import { sql } from "drizzle-orm";
import type { Transaction } from "@/services/product";

export const id = "001_studio_financial_links";
export async function up(tx: Transaction) {
  const statements = [
    sql`ALTER TABLE studio_contracts ADD COLUMN IF NOT EXISTS idempotency_key TEXT, ADD COLUMN IF NOT EXISTS financial_status TEXT DEFAULT 'draft' NOT NULL`,
    sql`ALTER TABLE studio_project_payments ADD COLUMN IF NOT EXISTS payment_id UUID REFERENCES payments(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS idempotency_key TEXT, ADD COLUMN IF NOT EXISTS financial_status TEXT DEFAULT 'draft' NOT NULL, ADD COLUMN IF NOT EXISTS void_reason TEXT, ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP`,
    sql`ALTER TABLE studio_project_expenses ADD COLUMN IF NOT EXISTS expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS payment_id UUID REFERENCES payments(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS idempotency_key TEXT, ADD COLUMN IF NOT EXISTS financial_status TEXT DEFAULT 'draft' NOT NULL, ADD COLUMN IF NOT EXISTS void_reason TEXT, ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP`,
    sql`ALTER TABLE personnel_salary_records ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS idempotency_key TEXT, ADD COLUMN IF NOT EXISTS financial_status TEXT DEFAULT 'draft' NOT NULL, ADD COLUMN IF NOT EXISTS void_reason TEXT, ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP`,
    sql`ALTER TABLE rental_equipment ADD COLUMN IF NOT EXISTS payment_id UUID REFERENCES payments(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS idempotency_key TEXT, ADD COLUMN IF NOT EXISTS financial_status TEXT DEFAULT 'draft' NOT NULL, ADD COLUMN IF NOT EXISTS void_reason TEXT, ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP`,
    sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_id UUID REFERENCES payments(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'posted' NOT NULL, ADD COLUMN IF NOT EXISTS reversal_of_expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS reversal_reason TEXT, ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMP`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_studio_projects_core_project ON studio_projects(project_id) WHERE project_id IS NOT NULL`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_studio_contracts_invoice ON studio_contracts(invoice_id) WHERE invoice_id IS NOT NULL`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_studio_contracts_idempotency ON studio_contracts(idempotency_key) WHERE idempotency_key IS NOT NULL`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_studio_payments_core_payment ON studio_project_payments(payment_id) WHERE payment_id IS NOT NULL`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_studio_payments_idempotency ON studio_project_payments(idempotency_key) WHERE idempotency_key IS NOT NULL`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_studio_expenses_core_expense ON studio_project_expenses(expense_id) WHERE expense_id IS NOT NULL`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_studio_expenses_idempotency ON studio_project_expenses(idempotency_key) WHERE idempotency_key IS NOT NULL`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_studio_salary_payment ON personnel_salary_records(payment_id) WHERE payment_id IS NOT NULL`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_studio_salary_idempotency ON personnel_salary_records(idempotency_key) WHERE idempotency_key IS NOT NULL`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_rental_expense ON rental_equipment(expense_id) WHERE expense_id IS NOT NULL`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_rental_idempotency ON rental_equipment(idempotency_key) WHERE idempotency_key IS NOT NULL`,
  ];
  for (const statement of statements) await tx.execute(statement);
}
