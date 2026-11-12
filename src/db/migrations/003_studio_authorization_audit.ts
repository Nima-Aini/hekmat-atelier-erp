import { sql } from "drizzle-orm";
import type { Transaction } from "@/services/product";

export const id = "003_studio_authorization_audit";

export async function up(tx: Transaction) {
  const statements = [
    sql`ALTER TABLE employee_accounts ADD COLUMN IF NOT EXISTS session_invalid_before TIMESTAMP`,
    sql`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL`,
    sql`ALTER TABLE studio_project_timelines ADD COLUMN IF NOT EXISTS actor_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL`,
    sql`CREATE TABLE IF NOT EXISTS auth_login_attempts (key TEXT PRIMARY KEY, attempts INTEGER DEFAULT 0 NOT NULL, window_started_at TIMESTAMP DEFAULT NOW() NOT NULL, blocked_until TIMESTAMP, updated_at TIMESTAMP DEFAULT NOW() NOT NULL)`,
    sql`INSERT INTO permissions(code, name) VALUES
      ('studio.contract.view', 'مشاهده قرارداد آتلیه'),
      ('studio.contract.manage', 'مدیریت قرارداد آتلیه'),
      ('studio.finance.view', 'مشاهده دریافت و هزینه آتلیه'),
      ('studio.finance.manage', 'ثبت و مدیریت عملیات مالی آتلیه'),
      ('studio.personnel.wage.view', 'مشاهده دستمزد عوامل آتلیه'),
      ('studio.personnel.wage.manage', 'ثبت و تسویه دستمزد عوامل آتلیه'),
      ('studio.profitability.view', 'مشاهده سودآوری پروژه آتلیه')
      ON CONFLICT (code) DO NOTHING`,
    sql`INSERT INTO role_permissions(role_id, permission_id)
      SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
      WHERE r.code = 'admin' AND p.code IN ('studio.contract.view','studio.contract.manage','studio.finance.view','studio.finance.manage','studio.personnel.wage.view','studio.personnel.wage.manage','studio.profitability.view')
      ON CONFLICT DO NOTHING`,
    sql`CREATE INDEX IF NOT EXISTS idx_audit_entity_lookup ON audit_logs(entity_type, entity_id, created_at DESC)`,
    sql`CREATE INDEX IF NOT EXISTS idx_audit_project_time ON audit_logs(project_id, created_at DESC)`,
  ];
  for (const statement of statements) await tx.execute(statement);
}
