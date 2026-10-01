import { sql } from "drizzle-orm";
import type { Transaction } from "@/services/product";

export const id = "006_atelier_product";
export async function up(tx: Transaction) {
  const statements = [
    sql`CREATE TABLE IF NOT EXISTS studio_workflow_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, job_type TEXT NOT NULL,
      stages JSONB NOT NULL, active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now())`,
    sql`CREATE TABLE IF NOT EXISTS studio_catalog (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), kind TEXT NOT NULL CHECK(kind IN ('service','package','addon')),
      parent_id UUID REFERENCES studio_catalog(id), name TEXT NOT NULL, job_type TEXT NOT NULL,
      description TEXT, base_price NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK(base_price >= 0),
      specifications JSONB NOT NULL DEFAULT '{}', workflow_template_id UUID REFERENCES studio_workflow_templates(id),
      active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now())`,
    sql`ALTER TABLE studio_projects ADD COLUMN IF NOT EXISTS catalog_item_id UUID REFERENCES studio_catalog(id)`,
    sql`ALTER TABLE studio_calendar_events ADD COLUMN IF NOT EXISTS owner_employee_id UUID REFERENCES employees(id)`,
    sql`ALTER TABLE studio_projects ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP`,
    sql`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS partner_category TEXT`,
    sql`ALTER TABLE studio_contracts ADD COLUMN IF NOT EXISTS package_snapshot JSONB`,
    sql`ALTER TABLE studio_production_plans ADD COLUMN IF NOT EXISTS workflow_template_id UUID REFERENCES studio_workflow_templates(id)`,
    sql`ALTER TABLE studio_production_plans ADD COLUMN IF NOT EXISTS workflow_snapshot JSONB`,
    sql`ALTER TABLE studio_tasks ADD COLUMN IF NOT EXISTS production_step_id UUID REFERENCES studio_production_steps(id)`,
    sql`ALTER TABLE studio_tasks ADD COLUMN IF NOT EXISTS dependency_id UUID REFERENCES studio_tasks(id)`,
    sql`ALTER TABLE studio_tasks ADD COLUMN IF NOT EXISTS blocker TEXT`,
    sql`ALTER TABLE studio_tasks ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0`,
    sql`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_studio_project_status') THEN
        ALTER TABLE studio_projects DROP CONSTRAINT chk_studio_project_status;
      END IF;
      ALTER TABLE studio_projects ADD CONSTRAINT chk_studio_project_status
        CHECK (status IN ('lead','contact','proposal','contract','active_project','booked','shooting','in_post_production','ready_for_review','approved','delivered','completed','archived','cancelled')) NOT VALID;
    END $$`,
    sql`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_equipment_reservation_status') THEN
        ALTER TABLE equipment_reservations DROP CONSTRAINT chk_equipment_reservation_status;
      END IF;
      ALTER TABLE equipment_reservations ADD CONSTRAINT chk_equipment_reservation_status
        CHECK (status IN ('reserved','checked_out','returned','returned_safe','damaged','cancelled')) NOT VALID;
    END $$`,
    sql`CREATE TABLE IF NOT EXISTS studio_leads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, mobile TEXT NOT NULL, source TEXT,
      event_type TEXT NOT NULL DEFAULT 'wedding', desired_date TIMESTAMP, location TEXT, budget NUMERIC(15,2) CHECK(budget >= 0),
      stage TEXT NOT NULL DEFAULT 'lead' CHECK(stage IN ('lead','contact','consultation','proposal','contract_pending','booked','lost','converted')),
      assigned_employee_id UUID REFERENCES employees(id), next_follow_up TIMESTAMP, last_contact_at TIMESTAMP,
      lost_reason TEXT, notes TEXT, catalog_item_id UUID REFERENCES studio_catalog(id),
      converted_project_id UUID UNIQUE REFERENCES studio_projects(id), consultation_event_id UUID REFERENCES studio_calendar_events(id),
      created_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now())`,
    sql`CREATE TABLE IF NOT EXISTS studio_deliverables (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), studio_project_id UUID NOT NULL REFERENCES studio_projects(id),
      kind TEXT NOT NULL, title TEXT NOT NULL, url TEXT, storage_location TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','ready','delivered','confirmed')),
      due_date TIMESTAMP, delivered_at TIMESTAMP, confirmed_at TIMESTAMP, notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now())`,
    sql`CREATE TABLE IF NOT EXISTS studio_installments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), contract_id UUID NOT NULL REFERENCES studio_contracts(id),
      title TEXT NOT NULL, amount NUMERIC(15,2) NOT NULL CHECK(amount > 0), due_date TIMESTAMP NOT NULL,
      position INTEGER NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT now(), UNIQUE(contract_id, position))`,
    sql`CREATE TABLE IF NOT EXISTS studio_installment_allocations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), installment_id UUID NOT NULL REFERENCES studio_installments(id),
      studio_payment_id UUID NOT NULL REFERENCES studio_project_payments(id), amount NUMERIC(15,2) NOT NULL CHECK(amount > 0),
      created_at TIMESTAMP NOT NULL DEFAULT now(), UNIQUE(installment_id, studio_payment_id))`,
    sql`CREATE INDEX IF NOT EXISTS idx_studio_lead_owner_followup ON studio_leads(assigned_employee_id, next_follow_up)`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_studio_personnel_employee ON studio_personnel(employee_id) WHERE employee_id IS NOT NULL`,
    sql`CREATE INDEX IF NOT EXISTS idx_studio_lead_mobile ON studio_leads(mobile)`,
    sql`CREATE INDEX IF NOT EXISTS idx_studio_task_project_due ON studio_tasks(studio_project_id, due_date)`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_studio_task_step ON studio_tasks(production_step_id) WHERE production_step_id IS NOT NULL`,
    sql`CREATE INDEX IF NOT EXISTS idx_studio_deliverable_project ON studio_deliverables(studio_project_id)`,
    sql`INSERT INTO permissions(code,name) VALUES
      ('studio.crm.manage','مدیریت سرنخ‌ها'), ('studio.catalog.manage','مدیریت خدمات و پکیج‌ها'),
      ('studio.tasks.manage','مدیریت کارها و گردش‌کار'), ('studio.deliverables.manage','مدیریت تحویل پروژه'),
      ('studio.reports.view','گزارش‌های عملیاتی آتلیه') ON CONFLICT(code) DO NOTHING`,
    // Grant only to roles that already have the corresponding operational capability.
    sql`INSERT INTO role_permissions(role_id,permission_id)
      SELECT DISTINCT rp.role_id, target.id FROM role_permissions rp
      JOIN permissions old ON old.id=rp.permission_id
      JOIN permissions target ON
        (old.code='studio.projects.manage' AND target.code='studio.crm.manage') OR
        (old.code='studio.production.manage' AND target.code IN ('studio.tasks.manage','studio.deliverables.manage')) OR
        (old.code='studio.view' AND target.code='studio.reports.view')
      ON CONFLICT DO NOTHING`,
    sql`INSERT INTO role_permissions(role_id,permission_id)
      SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.code='admin' AND p.code LIKE 'studio.%'
      ON CONFLICT DO NOTHING`,
    sql`UPDATE system_settings SET business_name='حکمت آتلیه', updated_at=now()
      WHERE id='main_config' AND business_name IN ('سازمان و کسب‌وکار حکمت آکما','سازمان و سیستم عملیاتی حکمت آکما')`,
  ];
  for (const statement of statements) await tx.execute(statement);
  await tx.execute(sql`INSERT INTO studio_workflow_templates(id,name,job_type,stages) VALUES
    ('a1000000-0000-4000-8000-000000000001','عروسی','wedding','[{"title":"مشاوره و انتخاب پکیج","stage":"consultation","days":-14},{"title":"قرارداد و تأیید بیعانه","stage":"contract","days":-10},{"title":"هماهنگی عوامل و لوکیشن","stage":"pre_production","days":-2},{"title":"عکاسی و تصویربرداری","stage":"shooting","days":0},{"title":"تأیید نسخه پشتیبان RAW","stage":"raw_backup","days":1},{"title":"جلسه انتخاب عکس","stage":"selection","days":3},{"title":"رتوش عکس‌ها","stage":"retouch","days":10},{"title":"تدوین و اصلاح رنگ ویدیو","stage":"video_edit","days":15},{"title":"طراحی و چاپ آلبوم","stage":"album_print","days":20},{"title":"کنترل کیفیت نهایی","stage":"final_qc","days":25},{"title":"تحویل و تأیید مشتری","stage":"delivery","days":30}]'::jsonb),
    ('a1000000-0000-4000-8000-000000000002','پرتره','portrait','[{"title":"رزرو و هماهنگی","stage":"booking","days":-2},{"title":"عکاسی","stage":"shooting","days":0},{"title":"تأیید نسخه پشتیبان RAW","stage":"raw_backup","days":1},{"title":"انتخاب عکس","stage":"selection","days":2},{"title":"رتوش عکس‌ها","stage":"retouch","days":5},{"title":"کنترل کیفیت","stage":"final_qc","days":6},{"title":"تحویل گالری","stage":"delivery","days":7}]'::jsonb),
    ('a1000000-0000-4000-8000-000000000003','تجاری و تبلیغاتی','commercial','[{"title":"بریف و برآورد پروژه","stage":"brief","days":-14},{"title":"پیشنهاد و قرارداد","stage":"contract","days":-10},{"title":"پیش‌تولید","stage":"pre_production","days":-2},{"title":"تولید و تصویربرداری","stage":"shooting","days":0},{"title":"تدوین و نسخه بازبینی","stage":"video_edit","days":10},{"title":"اصلاحات مشتری","stage":"revision","days":14},{"title":"کنترل کیفیت","stage":"final_qc","days":15},{"title":"تحویل نهایی","stage":"delivery","days":16}]'::jsonb)
    ON CONFLICT(id) DO NOTHING`);
}
