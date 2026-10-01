import { sql } from "drizzle-orm";
import type { Transaction } from "@/services/product";

export const id = "004_studio_constraints_indexes";

export async function up(tx: Transaction) {
  const statements = [
    sql`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_equipment_reservation_interval') THEN ALTER TABLE equipment_reservations ADD CONSTRAINT chk_equipment_reservation_interval CHECK (reserved_to > reserved_from) NOT VALID; END IF; END $$`,
    sql`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_studio_calendar_interval') THEN ALTER TABLE studio_calendar_events ADD CONSTRAINT chk_studio_calendar_interval CHECK (end_time > start_time) NOT VALID; END IF; END $$`,
    sql`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_rental_interval') THEN ALTER TABLE rental_equipment ADD CONSTRAINT chk_rental_interval CHECK (return_date >= pickup_date) NOT VALID; END IF; END $$`,
    sql`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_studio_contract_amounts') THEN ALTER TABLE studio_contracts ADD CONSTRAINT chk_studio_contract_amounts CHECK (total_amount >= 0 AND deposit_amount >= 0 AND deposit_amount <= total_amount AND installments_count > 0) NOT VALID; END IF; END $$`,
    sql`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_studio_payment_amount') THEN ALTER TABLE studio_project_payments ADD CONSTRAINT chk_studio_payment_amount CHECK (amount > 0) NOT VALID; END IF; END $$`,
    sql`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_studio_expense_amount') THEN ALTER TABLE studio_project_expenses ADD CONSTRAINT chk_studio_expense_amount CHECK (amount > 0) NOT VALID; END IF; END $$`,
    sql`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_studio_wage_amounts') THEN ALTER TABLE personnel_salary_records ADD CONSTRAINT chk_studio_wage_amounts CHECK (rate_amount >= 0 AND units_count > 0 AND total_calculated >= 0) NOT VALID; END IF; END $$`,
    sql`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_rental_cost') THEN ALTER TABLE rental_equipment ADD CONSTRAINT chk_rental_cost CHECK (rental_cost >= 0) NOT VALID; END IF; END $$`,
    sql`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_equipment_reservation_status') THEN ALTER TABLE equipment_reservations ADD CONSTRAINT chk_equipment_reservation_status CHECK (status IN ('reserved','checked_out','returned','returned_safe','cancelled')) NOT VALID; END IF; END $$`,
    sql`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_studio_calendar_status') THEN ALTER TABLE studio_calendar_events ADD CONSTRAINT chk_studio_calendar_status CHECK (status IN ('tentative','scheduled','confirmed','completed','postponed','cancelled')) NOT VALID; END IF; END $$`,
    sql`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_studio_project_status') THEN ALTER TABLE studio_projects ADD CONSTRAINT chk_studio_project_status CHECK (status IN ('lead','contact','proposal','contract','active_project','booked','shooting','in_post_production','ready_for_review','approved','delivered','completed','cancelled')) NOT VALID; END IF; END $$`,
    sql`CREATE INDEX IF NOT EXISTS idx_reservation_equipment_window ON equipment_reservations(equipment_id, reserved_from, reserved_to) WHERE status NOT IN ('cancelled', 'returned', 'returned_safe')`,
    sql`CREATE INDEX IF NOT EXISTS idx_reservation_project_time ON equipment_reservations(studio_project_id, reserved_from, reserved_to)`,
    sql`CREATE INDEX IF NOT EXISTS idx_calendar_project_time ON studio_calendar_events(studio_project_id, start_time, end_time)`,
    sql`CREATE INDEX IF NOT EXISTS idx_salary_project_personnel ON personnel_salary_records(studio_project_id, personnel_id)`,
    sql`CREATE INDEX IF NOT EXISTS idx_contract_project ON studio_contracts(studio_project_id)`,
    sql`CREATE INDEX IF NOT EXISTS idx_studio_payment_project ON studio_project_payments(studio_project_id)`,
    sql`CREATE INDEX IF NOT EXISTS idx_studio_expense_project ON studio_project_expenses(studio_project_id)`,
  ];
  for (const statement of statements) await tx.execute(statement);
}
