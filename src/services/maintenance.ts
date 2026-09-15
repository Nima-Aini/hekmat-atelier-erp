import { pool } from "@/db";

export type MaintenanceState = { active: true; operation: "restore"; backupId: string; startedAt: string };

export async function getMaintenanceState(): Promise<MaintenanceState | null> {
  const result = await pool.query("SELECT maintenance_mode, operation, backup_id, started_at FROM application_runtime_state WHERE id='global'");
  const row = result.rows[0];
  if (!row?.maintenance_mode) return null;
  return { active: true, operation: "restore", backupId: String(row.backup_id || "unknown"), startedAt: row.started_at instanceof Date ? row.started_at.toISOString() : String(row.started_at || "unknown") };
}

export async function enterMaintenanceMode(backupId: string) {
  await pool.query(`INSERT INTO application_runtime_state(id, maintenance_mode, operation, backup_id, started_at, updated_at)
    VALUES ('global', true, 'restore', $1, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET maintenance_mode=true, operation='restore', backup_id=EXCLUDED.backup_id, started_at=NOW(), updated_at=NOW()`, [backupId]);
}

export async function exitMaintenanceMode() {
  await pool.query("UPDATE application_runtime_state SET maintenance_mode=false, operation=NULL, backup_id=NULL, started_at=NULL, updated_at=NOW() WHERE id='global'");
}
