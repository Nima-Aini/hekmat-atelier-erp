import { sql } from "drizzle-orm";
import type { Transaction } from "@/services/product";

export const id = "010_atelier_final_polish";

export async function up(tx: Transaction) {
  const statements = [
    sql`ALTER TABLE studio_contracts ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(15,2) NOT NULL DEFAULT 0`,
    sql`ALTER TABLE studio_notifications ADD COLUMN IF NOT EXISTS condition_key TEXT`,
    sql`ALTER TABLE studio_notifications ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb`,
    sql`ALTER TABLE studio_notifications ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP`,
    sql`ALTER TABLE studio_notifications ADD COLUMN IF NOT EXISTS archived_by_id UUID REFERENCES employees(id) ON DELETE SET NULL`,
    sql`ALTER TABLE studio_notifications ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP`,
    sql`CREATE INDEX IF NOT EXISTS idx_studio_notifications_condition ON studio_notifications(condition_key, archived_at, resolved_at)`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_studio_notifications_open_condition ON studio_notifications(condition_key) WHERE condition_key IS NOT NULL AND archived_at IS NULL AND resolved_at IS NULL`,
  ];
  for (const statement of statements) await tx.execute(statement);
}
