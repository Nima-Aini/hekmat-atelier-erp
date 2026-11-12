import { sql } from "drizzle-orm";
import type { Transaction } from "@/services/product";

export const id = "014_atelier_advanced_workflow";
export async function up(tx: Transaction) {
  await tx.execute(sql`CREATE TABLE IF NOT EXISTS atelier_ai_actions (
    id UUID PRIMARY KEY, actor_id UUID NOT NULL REFERENCES employees(id), operation TEXT NOT NULL, target_id TEXT,
    parameters JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'pending', result JSONB,
    expires_at TIMESTAMP NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now())`);
  await tx.execute(sql`CREATE INDEX IF NOT EXISTS idx_atelier_ai_actions_actor_status_expiry ON atelier_ai_actions(actor_id,status,expires_at)`);
  await tx.execute(sql`INSERT INTO permissions(code,name) VALUES
    ('studio.contract.create','ایجاد قرارداد'),('studio.contract.edit','ویرایش قرارداد'),('studio.contract.approve','تأیید قرارداد'),
    ('studio.contract.cancel','ابطال قرارداد'),('studio.contract.delete_draft','حذف پیش‌قرارداد'),
    ('studio.customers.create','ایجاد مشتری'),('studio.customers.edit','ویرایش مشتری'),('studio.customers.delete','حذف مشتری'),
    ('studio.reservations.create','ایجاد رزرو'),('studio.reservations.edit','ویرایش رزرو'),('studio.reservations.delete','حذف رزرو'),('studio.reservations.view_all','مشاهده همه رزروها'),
    ('studio.finance.create_receipt','ثبت دریافت'),('studio.finance.create_expense','ثبت هزینه'),('studio.finance.refund','برگشت وجه'),('studio.finance.accounts','مدیریت حساب‌ها'),
    ('studio.personnel.finance.view','مشاهده مالی پرسنل'),('studio.personnel.finance.pay','پرداخت دستمزد'),
    ('studio.equipment.maintenance','نگهداری تجهیزات'),('studio.finance.reports','گزارش مالی'),('studio.finance.profit_view','مشاهده سود'),
    ('settings.manage','مدیریت تنظیمات'),('reports.view','مشاهده گزارش‌ها'),('reports.export','خروجی گزارش‌ها'),
    ('ai.use','استفاده از دستیار هوشمند') ON CONFLICT(code) DO NOTHING`);
  await tx.execute(sql`INSERT INTO role_permissions(role_id,permission_id)
    SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.code='admin' AND p.code IN (
      'studio.contract.create','studio.contract.edit','studio.contract.approve','studio.contract.cancel','studio.contract.delete_draft',
      'studio.customers.create','studio.customers.edit','studio.customers.delete','studio.reservations.create','studio.reservations.edit','studio.reservations.delete','studio.reservations.view_all',
      'studio.finance.create_receipt','studio.finance.create_expense','studio.finance.refund','studio.finance.accounts','studio.personnel.finance.view','studio.personnel.finance.pay',
      'studio.equipment.maintenance','studio.finance.reports','studio.finance.profit_view','settings.manage','reports.view','reports.export','ai.use') ON CONFLICT DO NOTHING`);
  await tx.execute(sql`CREATE TABLE IF NOT EXISTS studio_notification_reads (
    notification_id UUID NOT NULL REFERENCES studio_notifications(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    read_at TIMESTAMP NOT NULL DEFAULT now(), PRIMARY KEY(notification_id, employee_id))`);
  await tx.execute(sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS source_type TEXT, ADD COLUMN IF NOT EXISTS counterparty TEXT`);
  await tx.execute(sql`CREATE TABLE IF NOT EXISTS atelier_expense_categories (
    code TEXT PRIMARY KEY, title TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now())`);
  await tx.execute(sql`INSERT INTO atelier_expense_categories(code,title) VALUES
    ('general','عمومی'),('misc','سایر'),('other','سایر هزینه‌ها'),('salary','دستمزد'),('personnel','پرسنل'),
    ('rental','اجاره تجهیزات'),('rent','اجاره'),('utilities','قبوض'),('marketing','تبلیغات'),
    ('transport','حمل و نقل'),('location','لوکیشن'),('printing_album','چاپ و آلبوم'),('catering','پذیرایی'),
    ('retouch_edit','رتوش و تدوین'),('commission','پورسانت'),('raw_materials','مواد اولیه') ON CONFLICT DO NOTHING`);
  await tx.execute(sql`INSERT INTO atelier_expense_categories(code,title)
    SELECT DISTINCT category,category FROM expenses WHERE category IS NOT NULL AND category <> '' ON CONFLICT DO NOTHING`);
  await tx.execute(sql`INSERT INTO atelier_expense_categories(code,title)
    SELECT value,value FROM system_settings, jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(atelier_config->'finance'->'expenseCategories') = 'array' THEN atelier_config->'finance'->'expenseCategories' ELSE '[]'::jsonb END)
    WHERE value <> '' ON CONFLICT DO NOTHING`);
  await tx.execute(sql`ALTER TABLE studio_reservations
    ADD COLUMN IF NOT EXISTS owner_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS assigned_personnel_id UUID REFERENCES studio_personnel(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS viewer_employee_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS shared_personnel_ids JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await tx.execute(sql`UPDATE studio_reservations SET owner_employee_id = created_by_id WHERE owner_employee_id IS NULL AND created_by_id IS NOT NULL`);
  await tx.execute(sql`CREATE TABLE IF NOT EXISTS studio_customer_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), studio_customer_id UUID NOT NULL REFERENCES studio_customers(id),
    studio_project_id UUID REFERENCES studio_projects(id), contract_id UUID REFERENCES studio_contracts(id),
    title TEXT NOT NULL, notes TEXT, due_date TIMESTAMP, status TEXT NOT NULL DEFAULT 'pending',
    created_by UUID REFERENCES employees(id), created_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_customer_task_status CHECK (status IN ('pending','done','cancelled'))
  )`);
  await tx.execute(sql`CREATE INDEX IF NOT EXISTS idx_customer_tasks_customer ON studio_customer_tasks(studio_customer_id)`);
  await tx.execute(sql`ALTER TABLE studio_planning_personnel ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`);
  await tx.execute(sql`ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS source_type TEXT,
    ADD COLUMN IF NOT EXISTS source_id UUID,
    ADD COLUMN IF NOT EXISTS original_payment_id UUID REFERENCES payments(id),
    ADD COLUMN IF NOT EXISTS title TEXT,
    ADD COLUMN IF NOT EXISTS counterparty TEXT`);
  await tx.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_original_refund ON payments(original_payment_id)`);
  await tx.execute(sql`ALTER TABLE studio_contracts
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
    ADD COLUMN IF NOT EXISTS cancellation_snapshot JSONB`);
}
