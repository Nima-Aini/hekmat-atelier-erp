import { sql } from "drizzle-orm";
import type { Transaction } from "@/services/product";

export const id = "008_atelier_finance_cashflow";

export async function up(tx: Transaction) {
  const statements = [
    sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS request_key TEXT`,
    sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS request_hash TEXT`,
    sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS due_date TIMESTAMP`,
    sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(15,2) NOT NULL DEFAULT 0`,
    sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid'`,
    sql`UPDATE expenses SET paid_amount=amount, payment_status='paid' WHERE payment_id IS NOT NULL AND paid_amount=0`,
    sql`CREATE TABLE IF NOT EXISTS expense_payment_allocations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE RESTRICT,
      payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
      allocated_amount NUMERIC(15,2) NOT NULL CHECK(allocated_amount > 0), created_at TIMESTAMP NOT NULL DEFAULT now(),
      UNIQUE(expense_id,payment_id))`,
    sql`CREATE INDEX IF NOT EXISTS idx_expense_payment_allocation_expense ON expense_payment_allocations(expense_id)`,
    sql`CREATE INDEX IF NOT EXISTS idx_expense_payment_allocation_payment ON expense_payment_allocations(payment_id)`,
    sql`INSERT INTO expense_payment_allocations(expense_id,payment_id,allocated_amount)
      SELECT id,payment_id,amount FROM expenses WHERE payment_id IS NOT NULL ON CONFLICT DO NOTHING`,
    sql`CREATE TABLE IF NOT EXISTS atelier_expense_sources (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), expense_id UUID NOT NULL UNIQUE REFERENCES expenses(id) ON DELETE RESTRICT,
      source_type TEXT NOT NULL, source_id UUID NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT now(),
      UNIQUE(source_type,source_id))`,
    sql`ALTER TABLE studio_daily_visits ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE RESTRICT`,
    sql`ALTER TABLE studio_daily_visits ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id) ON DELETE RESTRICT`,
    sql`ALTER TABLE studio_daily_visits ADD COLUMN IF NOT EXISTS idempotency_key TEXT`,
    sql`ALTER TABLE studio_daily_visits ADD COLUMN IF NOT EXISTS financial_status TEXT NOT NULL DEFAULT 'draft'`,
    sql`ALTER TABLE studio_daily_visits ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_visit_invoice ON studio_daily_visits(invoice_id) WHERE invoice_id IS NOT NULL`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_visit_idempotency ON studio_daily_visits(idempotency_key) WHERE idempotency_key IS NOT NULL`,
    sql`ALTER TABLE studio_reservations ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE RESTRICT`,
    sql`ALTER TABLE studio_reservations ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id) ON DELETE RESTRICT`,
    sql`ALTER TABLE studio_reservations ADD COLUMN IF NOT EXISTS idempotency_key TEXT`,
    sql`ALTER TABLE studio_reservations ADD COLUMN IF NOT EXISTS financial_status TEXT NOT NULL DEFAULT 'draft'`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_reservation_invoice ON studio_reservations(invoice_id) WHERE invoice_id IS NOT NULL`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_reservation_idempotency ON studio_reservations(idempotency_key) WHERE idempotency_key IS NOT NULL`,
    sql`CREATE INDEX IF NOT EXISTS idx_expenses_due_status ON expenses(payment_status,due_date)`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_expenses_request_key ON expenses(request_key) WHERE request_key IS NOT NULL`,
    sql`CREATE INDEX IF NOT EXISTS idx_atelier_expense_source_lookup ON atelier_expense_sources(source_type,source_id)`,
    sql`DO $$ BEGIN ALTER TABLE expenses ADD CONSTRAINT chk_expense_paid_amount CHECK (paid_amount >= 0 AND paid_amount <= amount) NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    sql`DO $$ BEGIN ALTER TABLE expenses ADD CONSTRAINT chk_expense_payment_status CHECK (payment_status IN ('unpaid','partial','paid','reversed')) NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    sql`DO $$ BEGIN ALTER TABLE atelier_expense_sources ADD CONSTRAINT chk_atelier_expense_source_type CHECK (source_type IN ('personnel_wage','rental','direct_expense','general_expense')) NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    sql`INSERT INTO permissions(code,name) VALUES
      ('studio.finance.view','مشاهده مرکز مالی آتلیه'),
      ('studio.finance.manage','مدیریت دریافت‌ها و پرداخت‌های آتلیه') ON CONFLICT(code) DO NOTHING`,
    sql`INSERT INTO role_permissions(role_id,permission_id)
      SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
      WHERE r.code='admin' AND p.code IN ('studio.finance.view','studio.finance.manage') ON CONFLICT DO NOTHING`,
  ];
  for (const statement of statements) await tx.execute(statement);
}
