import { sql } from "drizzle-orm";
import type { Transaction } from "@/services/product";

export const id = "009_atelier_packages_personnel";

export async function up(tx: Transaction) {
  const statements = [
    sql`ALTER TABLE studio_catalog ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0`,
    sql`ALTER TABLE studio_personnel ADD COLUMN IF NOT EXISTS fixed_salary NUMERIC(15,2) NOT NULL DEFAULT 0`,
    sql`ALTER TABLE studio_personnel ADD COLUMN IF NOT EXISTS payment_cycle TEXT DEFAULT 'monthly'`,
    sql`CREATE TABLE IF NOT EXISTS employee_permissions (
      employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      granted BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT now(),
      updated_at TIMESTAMP NOT NULL DEFAULT now(),
      PRIMARY KEY(employee_id, permission_id))`,
    sql`CREATE TABLE IF NOT EXISTS studio_daily_visit_titles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), title TEXT NOT NULL UNIQUE,
      active BOOLEAN NOT NULL DEFAULT TRUE, sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now())`,
    sql`CREATE TABLE IF NOT EXISTS studio_daily_visit_personnel (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      daily_visit_id UUID NOT NULL REFERENCES studio_daily_visits(id) ON DELETE RESTRICT,
      personnel_id UUID NOT NULL REFERENCES studio_personnel(id) ON DELETE RESTRICT,
      personnel_name_snapshot TEXT NOT NULL, work_title TEXT NOT NULL,
      wage_snapshot NUMERIC(15,2) NOT NULL DEFAULT 0,
      salary_record_id UUID REFERENCES personnel_salary_records(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'active', removed_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now(),
      UNIQUE(daily_visit_id, personnel_id, work_title))`,
    sql`CREATE INDEX IF NOT EXISTS idx_daily_visit_personnel_visit ON studio_daily_visit_personnel(daily_visit_id)`,
    sql`CREATE INDEX IF NOT EXISTS idx_daily_visit_personnel_person ON studio_daily_visit_personnel(personnel_id)`,
    sql`INSERT INTO roles(code,name,project_scoped) VALUES ('atelier_personnel','پرسنل آتلیه',TRUE) ON CONFLICT(code) DO NOTHING`,
    sql`INSERT INTO permissions(code,name) VALUES
      ('studio.dashboard.view','مشاهده داشبورد آتلیه'),
      ('studio.daily_visits.view','مشاهده مراجعات روزانه'),
      ('studio.reservations.view','مشاهده رزروها'),
      ('studio.planning.view','مشاهده برنامه‌ریزی'),
      ('studio.calendar.view','مشاهده تقویم'),
      ('studio.customers.view','مشاهده مشتریان'),
      ('studio.personnel.view','مشاهده پرسنل'),
      ('studio.equipment.view','مشاهده تجهیزات'),
      ('studio.notifications.view','مشاهده اعلانات') ON CONFLICT(code) DO NOTHING`,
    sql`INSERT INTO role_permissions(role_id,permission_id)
      SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.code='admin' AND p.code LIKE 'studio.%'
      ON CONFLICT DO NOTHING`,
  ];
  for (const statement of statements) await tx.execute(statement);
}
