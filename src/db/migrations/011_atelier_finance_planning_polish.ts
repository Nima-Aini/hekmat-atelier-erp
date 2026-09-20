import { sql } from "drizzle-orm";
import type { Transaction } from "@/services/product";

export const id = "011_atelier_finance_planning_polish";

export async function up(tx: Transaction) {
  const statements = [
    sql`ALTER TABLE studio_contracts ADD COLUMN IF NOT EXISTS financial_notes TEXT`,
    sql`ALTER TABLE studio_installments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()`,
    sql`CREATE TABLE IF NOT EXISTS account_balance_adjustments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
      old_balance NUMERIC(15,2) NOT NULL,
      new_balance NUMERIC(15,2) NOT NULL,
      delta NUMERIC(15,2) NOT NULL,
      reason TEXT NOT NULL,
      adjusted_at TIMESTAMP NOT NULL,
      created_by_id UUID REFERENCES employees(id) ON DELETE SET NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
    sql`CREATE INDEX IF NOT EXISTS idx_account_adjustments_account_date ON account_balance_adjustments(account_id, adjusted_at DESC)`,
  ];
  for (const statement of statements) await tx.execute(statement);
}
