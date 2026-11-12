import "dotenv/config";
import { pool } from "../src/db";
import { createSystemBackup, restoreBackupToIsolatedDatabase, validateRestore } from "../src/services/backup";

async function main() {
  if (process.env.APP_ENV !== "staging" || process.env.ALLOW_STAGING_RESTORE_DRILL !== "true") {
    throw new Error("Staging recovery drill requires APP_ENV=staging and ALLOW_STAGING_RESTORE_DRILL=true.");
  }
  if (!process.env.RESTORE_TARGET_DATABASE_URL?.trim()) throw new Error("RESTORE_TARGET_DATABASE_URL must identify a separate empty staging drill database.");
  const actor = { userId: "staging_recovery_drill", userName: "Staging Recovery Drill" };
  const backup = await createSystemBackup(actor, `Staging recovery drill ${process.env.GIT_SHA || "unknown"}`);
  const validation = await validateRestore(backup.id, actor);
  if (!validation.backupValid) throw new Error("Staging backup validation failed.");
  const restored = await restoreBackupToIsolatedDatabase(backup.id, "RESTORE", actor);
  console.log("staging.recovery_drill.success", { backupId: backup.id, checksum: backup.checksum, schemaVersion: validation.backupSchemaVersion, targetVerified: restored.targetVerified, integrityValid: restored.integrity.valid, switched: restored.switched });
}

void main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error("staging.recovery_drill.failed", { message: error instanceof Error ? error.message : "unknown error" });
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
