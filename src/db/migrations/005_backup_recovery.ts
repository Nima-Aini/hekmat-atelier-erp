import { sql } from "drizzle-orm";
import type { Transaction } from "@/services/product";

export const id = "005_backup_recovery";

export async function up(tx: Transaction) {
  const statements = [
    sql`ALTER TABLE backups ADD COLUMN IF NOT EXISTS storage_driver TEXT DEFAULT 'legacy' NOT NULL`,
    sql`ALTER TABLE backups ADD COLUMN IF NOT EXISTS storage_key TEXT`,
    sql`ALTER TABLE backups ADD COLUMN IF NOT EXISTS format TEXT DEFAULT 'legacy_json' NOT NULL`,
    sql`ALTER TABLE backups ADD COLUMN IF NOT EXISTS format_version INTEGER DEFAULT 1 NOT NULL`,
    sql`ALTER TABLE backups ADD COLUMN IF NOT EXISTS size_bytes_bigint BIGINT`,
    sql`ALTER TABLE backups ADD COLUMN IF NOT EXISTS schema_version TEXT`,
    sql`ALTER TABLE backups ADD COLUMN IF NOT EXISTS git_sha TEXT`,
    sql`ALTER TABLE backups ADD COLUMN IF NOT EXISTS database_driver TEXT`,
    sql`ALTER TABLE backups ADD COLUMN IF NOT EXISTS created_by_id UUID REFERENCES employees(id) ON DELETE SET NULL`,
    sql`ALTER TABLE backups ADD COLUMN IF NOT EXISTS notes TEXT`,
    sql`ALTER TABLE backups ADD COLUMN IF NOT EXISTS failure_reason TEXT`,
    sql`ALTER TABLE backups ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP`,
    sql`ALTER TABLE backups ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb`,
    sql`CREATE TABLE IF NOT EXISTS application_runtime_state (
      id TEXT PRIMARY KEY,
      maintenance_mode BOOLEAN DEFAULT false NOT NULL,
      operation TEXT,
      backup_id UUID,
      started_at TIMESTAMP,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )`,
    sql`INSERT INTO application_runtime_state(id, maintenance_mode) VALUES ('global', false) ON CONFLICT (id) DO NOTHING`,
    sql`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_backup_status') THEN ALTER TABLE backups ADD CONSTRAINT chk_backup_status CHECK (status IN ('pending','running','completed','failed','verified','deleted','expired','restored')) NOT VALID; END IF; END $$`,
    sql`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_backup_format_version') THEN ALTER TABLE backups ADD CONSTRAINT chk_backup_format_version CHECK (format_version > 0) NOT VALID; END IF; END $$`,
    sql`INSERT INTO permissions(code, name) VALUES
      ('backup.download', 'دریافت فایل پشتیبان'),
      ('backup.verify', 'اعتبارسنجی فایل پشتیبان'),
      ('backup.restore', 'بازیابی پایگاه داده'),
      ('backup.delete', 'حذف فایل پشتیبان')
      ON CONFLICT (code) DO NOTHING`,
    sql`INSERT INTO role_permissions(role_id, permission_id)
      SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
      WHERE r.code = 'admin' AND p.code IN ('backup.view','backup.create','backup.download','backup.verify','backup.restore','backup.delete')
      ON CONFLICT DO NOTHING`,
    sql`DELETE FROM role_permissions rp USING roles r, permissions p
      WHERE rp.role_id=r.id AND rp.permission_id=p.id AND r.code <> 'admin'
      AND p.code IN ('backup.create','backup.download','backup.verify','backup.restore','backup.delete')`,
    sql`CREATE INDEX IF NOT EXISTS idx_backups_status_created ON backups(status, created_at DESC)`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_backups_storage_key ON backups(storage_key) WHERE storage_key IS NOT NULL`,
  ];
  for (const statement of statements) await tx.execute(statement);
}
