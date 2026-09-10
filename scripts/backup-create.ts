import "dotenv/config";
import { createSystemBackup } from "../src/services/backup";
import { pool } from "../src/db";

async function main() {
  let code = 0;
  try { const backup = await createSystemBackup({ userId: "system_backup", userName: "System Backup Scheduler" }, process.env.BACKUP_NOTES); console.log("backup.create.success", { backupId: backup.id, status: backup.status, checksum: backup.checksum, sizeBytes: backup.sizeBytesBigint || backup.sizeBytes }); }
  catch (error) { console.error("backup.create.failed", { message: error instanceof Error ? error.message : "unknown error" }); code = 1; }
  finally { await pool.end(); }
  return code;
}
void main().then((code) => process.exit(code));
