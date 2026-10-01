import { sql } from "drizzle-orm";
import type { Transaction } from "@/services/product";

export const id = "007_atelier_final_workflow";

export async function up(tx: Transaction) {
  const statements = [
    sql`ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS atelier_config JSONB NOT NULL DEFAULT '{}'::jsonb`,
    sql`CREATE TABLE IF NOT EXISTS studio_project_types (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true, sort_order INTEGER NOT NULL DEFAULT 0,
      field_schema JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now())`,
    sql`ALTER TABLE studio_contracts ADD COLUMN IF NOT EXISTS project_type_id UUID REFERENCES studio_project_types(id)`,
    sql`ALTER TABLE studio_contracts ADD COLUMN IF NOT EXISTS type_metadata JSONB NOT NULL DEFAULT '{}'::jsonb`,
    sql`ALTER TABLE studio_contracts ADD COLUMN IF NOT EXISTS program_date TIMESTAMP`,
    sql`ALTER TABLE studio_contracts ADD COLUMN IF NOT EXISTS program_end_date TIMESTAMP`,
    sql`ALTER TABLE studio_contracts ADD COLUMN IF NOT EXISTS execution_location TEXT`,
    sql`ALTER TABLE studio_contracts ADD COLUMN IF NOT EXISTS notes TEXT`,
    sql`ALTER TABLE studio_contracts ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP`,
    sql`ALTER TABLE studio_contracts ADD COLUMN IF NOT EXISTS approved_by_id UUID REFERENCES employees(id)`,
    sql`CREATE TABLE IF NOT EXISTS studio_contract_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), contract_id UUID NOT NULL REFERENCES studio_contracts(id) ON DELETE CASCADE,
      title TEXT NOT NULL, description TEXT, quantity NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK(quantity > 0),
      unit_price NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK(unit_price >= 0), notes TEXT, position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now())`,
    sql`CREATE INDEX IF NOT EXISTS idx_studio_contract_items_contract ON studio_contract_items(contract_id)`,
    sql`CREATE TABLE IF NOT EXISTS studio_personnel_default_wages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), personnel_id UUID NOT NULL REFERENCES studio_personnel(id) ON DELETE CASCADE,
      work_title TEXT NOT NULL, amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK(amount >= 0),
      created_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now(), UNIQUE(personnel_id, work_title))`,
    sql`CREATE TABLE IF NOT EXISTS studio_planning_personnel (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), contract_item_id UUID NOT NULL REFERENCES studio_contract_items(id) ON DELETE CASCADE,
      personnel_id UUID NOT NULL REFERENCES studio_personnel(id) ON DELETE RESTRICT,
      starts_at TIMESTAMP NOT NULL, ends_at TIMESTAMP NOT NULL, wage_snapshot NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK(wage_snapshot >= 0),
      salary_record_id UUID REFERENCES personnel_salary_records(id), notes TEXT, assigned_by_id UUID REFERENCES employees(id), created_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now(),
      CHECK(ends_at > starts_at), UNIQUE(contract_item_id, personnel_id))`,
    sql`CREATE INDEX IF NOT EXISTS idx_planning_personnel_time ON studio_planning_personnel(personnel_id, starts_at, ends_at)`,
    sql`ALTER TABLE equipment_reservations ADD COLUMN IF NOT EXISTS contract_item_id UUID REFERENCES studio_contract_items(id) ON DELETE CASCADE`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_equipment_contract_item ON equipment_reservations(contract_item_id, equipment_id) WHERE contract_item_id IS NOT NULL`,
    sql`ALTER TABLE rental_equipment ADD COLUMN IF NOT EXISTS contract_item_id UUID REFERENCES studio_contract_items(id) ON DELETE CASCADE`,
    sql`ALTER TABLE rental_equipment ADD COLUMN IF NOT EXISTS marked_rented_at TIMESTAMP`,
    sql`ALTER TABLE rental_equipment ADD COLUMN IF NOT EXISTS marked_rented_by_id UUID REFERENCES employees(id)`,
    sql`ALTER TABLE studio_calendar_events ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES studio_contracts(id) ON DELETE CASCADE`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_contract ON studio_calendar_events(contract_id) WHERE contract_id IS NOT NULL`,
    sql`CREATE TABLE IF NOT EXISTS studio_daily_visits (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), title TEXT NOT NULL, visit_date TIMESTAMP NOT NULL,
      price NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK(price >= 0), paid_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK(paid_amount >= 0 AND paid_amount <= price),
      customer_name TEXT NOT NULL, mobile TEXT NOT NULL, notes TEXT, created_by_id UUID REFERENCES employees(id),
      created_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now())`,
    sql`CREATE INDEX IF NOT EXISTS idx_studio_daily_visits_date ON studio_daily_visits(visit_date DESC)`,
    sql`CREATE TABLE IF NOT EXISTS studio_reservations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), title TEXT NOT NULL, reserved_at TIMESTAMP NOT NULL,
      price NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK(price >= 0), paid_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK(paid_amount >= 0 AND paid_amount <= price),
      customer_name TEXT NOT NULL, mobile TEXT NOT NULL, notes TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','cancelled')),
      completed_at TIMESTAMP, completed_by_id UUID REFERENCES employees(id), created_by_id UUID REFERENCES employees(id),
      created_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now())`,
    sql`CREATE INDEX IF NOT EXISTS idx_studio_reservations_date_status ON studio_reservations(reserved_at, status)`,
    sql`INSERT INTO permissions(code,name) VALUES
      ('studio.daily_visits.manage','مدیریت مراجعات روزانه'),
      ('studio.reservations.manage','مدیریت رزروها'),
      ('studio.planning.manage','مدیریت برنامه‌ریزی قراردادها') ON CONFLICT(code) DO NOTHING`,
    sql`INSERT INTO role_permissions(role_id,permission_id)
      SELECT DISTINCT rp.role_id,target.id FROM role_permissions rp
      JOIN permissions old ON old.id=rp.permission_id CROSS JOIN permissions target
      WHERE (old.code='studio.projects.manage' AND target.code IN ('studio.daily_visits.manage','studio.reservations.manage'))
         OR (old.code='studio.production.manage' AND target.code='studio.planning.manage')
      ON CONFLICT DO NOTHING`,
    sql`INSERT INTO role_permissions(role_id,permission_id)
      SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
      WHERE r.code='admin' AND p.code IN ('studio.daily_visits.manage','studio.reservations.manage','studio.planning.manage')
      ON CONFLICT DO NOTHING`,
  ];
  for (const statement of statements) await tx.execute(statement);

  await tx.execute(sql`INSERT INTO studio_project_types(code,title,sort_order,field_schema) VALUES
    ('wedding','عروسی',10,'[{"key":"brideName","label":"نام عروس"},{"key":"groomName","label":"نام داماد"},{"key":"venue","label":"تالار / باغ / لوکیشن"},{"key":"attendanceTime","label":"ساعت حضور"},{"key":"ceremonyNotes","label":"توضیحات خاص مراسم"}]'::jsonb),
    ('ceremony','عقد',20,'[{"key":"brideName","label":"نام عروس"},{"key":"groomName","label":"نام داماد"},{"key":"venue","label":"محل مراسم"},{"key":"ceremonyNotes","label":"توضیحات خاص مراسم"}]'::jsonb),
    ('engagement','نامزدی',30,'[{"key":"brideName","label":"نام عروس"},{"key":"groomName","label":"نام داماد"},{"key":"venue","label":"لوکیشن"}]'::jsonb),
    ('formalite','فرمالیته',40,'[{"key":"brideName","label":"نام عروس"},{"key":"groomName","label":"نام داماد"},{"key":"venue","label":"لوکیشن"}]'::jsonb),
    ('birthday','تولد',50,'[{"key":"subjectName","label":"نام سوژه"},{"key":"age","label":"سن"},{"key":"theme","label":"تم"},{"key":"location","label":"لوکیشن"}]'::jsonb),
    ('child','کودک',60,'[{"key":"subjectName","label":"نام کودک"},{"key":"age","label":"سن کودک"},{"key":"theme","label":"تم"},{"key":"location","label":"لوکیشن"}]'::jsonb),
    ('pregnancy','بارداری',70,'[{"key":"subjectName","label":"نام سوژه"},{"key":"theme","label":"تم"},{"key":"location","label":"لوکیشن"}]'::jsonb),
    ('portrait','پرتره',80,'[{"key":"subjectName","label":"نام سوژه"},{"key":"location","label":"لوکیشن"},{"key":"stylesCount","label":"تعداد استایل / لباس"}]'::jsonb),
    ('modeling','مدلینگ',90,'[{"key":"subjectName","label":"نام سوژه"},{"key":"location","label":"لوکیشن"},{"key":"stylesCount","label":"تعداد استایل / لباس"}]'::jsonb),
    ('industrial','صنعتی',100,'[{"key":"brandName","label":"نام شرکت / برند"},{"key":"subject","label":"موضوع"},{"key":"outputCount","label":"تعداد خروجی"},{"key":"deliveryDate","label":"تاریخ تحویل"}]'::jsonb),
    ('advertising','تبلیغاتی',110,'[{"key":"brandName","label":"نام شرکت / برند"},{"key":"subject","label":"موضوع"},{"key":"outputCount","label":"تعداد خروجی"},{"key":"deliveryDate","label":"تاریخ تحویل"}]'::jsonb),
    ('event','همایش / مراسم',120,'[{"key":"organizationName","label":"نام مجموعه"},{"key":"subject","label":"موضوع مراسم"},{"key":"venue","label":"محل مراسم"}]'::jsonb),
    ('other','سایر',130,'[{"key":"subject","label":"موضوع"}]'::jsonb)
    ON CONFLICT(code) DO NOTHING`);
}
