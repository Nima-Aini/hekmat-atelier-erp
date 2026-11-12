import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { pool } from "@/db";
import { ApiError } from "@/lib/apiError";
import { createSystemBackup, verifySystemBackup } from "@/services/backup";
import { getBackupStorage, type BackupStorage } from "@/services/backupStorage";
import { enterMaintenanceMode, exitMaintenanceMode } from "@/services/maintenance";
import { verifyDatabaseIntegrity } from "@/services/databaseIntegrity";
import type { AuditContext } from "@/services/audit";

const identifier = (name: string) => `"${name.replaceAll('"', '""')}"`;
const nameOf = (url: URL) => decodeURIComponent(url.pathname.slice(1));
const sameServer = (a: URL, b: URL) => a.hostname === b.hostname && (a.port || "5432") === (b.port || "5432");

function operationalPool(connectionString: string) {
 const value = new Pool({ connectionString, max: 1 });
 // Cutover can close an idle backend while its socket is finishing shutdown.
 // Active queries still reject normally; idle errors must never crash the app.
 value.on("error", (error: { code?: string }) => console.error("restore.idle_connection_closed", { code: error.code || "CONNECTION_CLOSED" }));
 return value;
}

export function activationAvailable() { return process.env.RESTORE_ALLOW_ACTIVATION === "true" && Boolean(process.env.POSTGRES_ADMIN_URL && process.env.RESTORE_TARGET_DATABASE_URL); }


export async function prepareRestoreTarget() {
 if (!activationAvailable()) throw new ApiError(422, "فعال‌سازی در سرور پیکربندی نشده است.");
 const source = new URL(process.env.DATABASE_URL!); const target = new URL(process.env.RESTORE_TARGET_DATABASE_URL!); const control = new URL(process.env.POSTGRES_ADMIN_URL!);
 if (!sameServer(source,target) || !sameServer(source,control) || nameOf(source) === nameOf(target) || [nameOf(source),nameOf(target)].includes(nameOf(control))) throw new ApiError(422, "پیکربندی دیتابیس مقصد نامعتبر است.");
 const admin = operationalPool(control.toString());
 try { const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [nameOf(target)]); if (!exists.rows.length) await admin.query(`CREATE DATABASE ${identifier(nameOf(target))} OWNER ${identifier(decodeURIComponent(target.username))}`); }
 finally { await admin.end(); }
}

/** Recoverable database-name cutover. The old database is kept intact and closed
 * to new connections. Every external operational event is persisted outside both DBs. */
export async function activateRestoredDatabase(backupId: string, confirmation: unknown, context: AuditContext, storage: BackupStorage = getBackupStorage()) {
 if (confirmation !== "RESTORE") throw new ApiError(400, "عبارت تأیید بازیابی لازم است.");
 if (!activationAvailable()) throw new ApiError(422, "فعال‌سازی بازیابی هنوز در سرور پیکربندی نشده است.", "RESTORE_ACTIVATION_NOT_CONFIGURED");
 const source = new URL(process.env.DATABASE_URL!); const target = new URL(process.env.RESTORE_TARGET_DATABASE_URL!); const control = new URL(process.env.POSTGRES_ADMIN_URL!);
 if (!sameServer(source, target) || !sameServer(source, control) || nameOf(source) === nameOf(target) || [nameOf(source), nameOf(target)].includes(nameOf(control))) throw new ApiError(422, "انتقال امن به دو دیتابیس مجزا و اتصال مدیریتی مستقل روی یک سرور نیاز دارد.");
 const adminPool = operationalPool(control.toString());
 const admin = await adminPool.connect(); let locked = false; let switched = false; let frozen = false;
 const operationId = randomUUID();
 const retainedName = `atelier_before_${randomUUID().replaceAll("-", "")}`; let safetyBackupId: string | null = null;
 let candidate: Pool | null = operationalPool(target.toString());
 const event = async (status: string) => storage.writeMetadata(randomUUID(), { kind: "restore_operation", operationId, backupId, safetyBackupId, retainedDatabase: retainedName, status, createdAt: new Date().toISOString(), initiatedBy: context.employeeId || context.userId || null });
 const terminate = (name: string) => admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()", [name]);
 const rename = async (client: PoolClient, from: string, to: string) => client.query(`ALTER DATABASE ${identifier(from)} RENAME TO ${identifier(to)}`);
 try {
  locked = Boolean((await admin.query("SELECT pg_try_advisory_lock(761512, 2) AS locked")).rows[0]?.locked);
  if (!locked) throw new ApiError(409, "انتقال دیگری در حال انجام است.", "RESTORE_BUSY");
  const integrity = await verifyDatabaseIntegrity(candidate); if (!integrity.valid) throw new ApiError(422, "دیتابیس مقصد یکپارچه نیست.");
  const admins = await candidate.query("SELECT 1 FROM employee_accounts a JOIN employees e ON e.id=a.employee_id JOIN roles r ON r.id=a.role_id WHERE r.code='admin' AND a.status='active' AND e.status='active' AND COALESCE(e.offboarding_stage,'active')='active' LIMIT 1");
  if (!admins.rows.length) throw new ApiError(422, "نسخه انتخابی حساب مدیر فعال ندارد؛ بازیابی نیازمند بررسی مسئول سرور است.", "RESTORE_ADMIN_MISSING");
  await enterMaintenanceMode(backupId);
  const safety = await createSystemBackup(context, `pre-restore:${backupId}:activation`, storage);
  await verifySystemBackup(safety.id, context, storage); safetyBackupId = safety.id;
  await event("safety_verified");
  // Keep recovery metadata and access to the protected safety archive after cutover.
  await candidate.query("INSERT INTO backups(id,filename,size_bytes,size_bytes_bigint,checksum,status,storage_driver,storage_key,format,format_version,schema_version,database_driver,notes,metadata,verified_at) VALUES($1::uuid,$2,$3,$4,$5,'verified','local',$1::text,$6,$7,$8,'postgres',$9,$10,NOW()) ON CONFLICT(id) DO NOTHING", [safety.id,safety.filename,safety.sizeBytes,safety.sizeBytesBigint,safety.checksum,safety.format,safety.formatVersion,safety.schemaVersion,`pre-restore:${backupId}:activation`,JSON.stringify(safety.metadata)]);
  await candidate.query("UPDATE employee_accounts SET session_invalid_before=NOW()");
  await candidate.query("INSERT INTO application_runtime_state(id,maintenance_mode,operation,backup_id,started_at,updated_at) VALUES('global',true,'restore',$1,NOW(),NOW()) ON CONFLICT(id) DO UPDATE SET maintenance_mode=true,operation='restore',backup_id=$1,started_at=NOW(),updated_at=NOW()", [backupId]);
  await candidate.end(); candidate = null;
  await admin.query(`ALTER DATABASE ${identifier(nameOf(source))} ALLOW_CONNECTIONS false`); frozen = true;
  await admin.query(`ALTER DATABASE ${identifier(nameOf(target))} ALLOW_CONNECTIONS false`);
  await terminate(nameOf(source)); await terminate(nameOf(target));
  await event("cutover_started");
  await admin.query("BEGIN");
  try { await rename(admin, nameOf(source), retainedName); await rename(admin, nameOf(target), nameOf(source)); await admin.query("COMMIT"); switched = true; }
  catch (error) { await admin.query("ROLLBACK"); throw error; }
  await admin.query(`ALTER DATABASE ${identifier(nameOf(source))} ALLOW_CONNECTIONS true`);
  candidate = operationalPool(source.toString());
  const verified = await verifyDatabaseIntegrity(candidate); if (!verified.valid) throw new ApiError(422, "تأیید پس از انتقال ناموفق بود.");
  await candidate.query("INSERT INTO audit_logs(action,entity_type,entity_id,user_id,user_name,details) VALUES('RESTORE_ACTIVATED','database_backup',$1,$2,$3,$4)", [backupId,context.employeeId || context.userId || "operator",context.userName || "مدیر",JSON.stringify({ operationId, safetyBackupId, retainedDatabase: retainedName, verified: true })]);
  await event("activated_verified");
  await candidate.query("UPDATE application_runtime_state SET maintenance_mode=false,operation=NULL,backup_id=NULL,updated_at=NOW() WHERE id='global'");
  return { activated: true, verified: true, safetyBackupId, sessionsInvalidated: true };
 } catch (error) {
  if (frozen) {
   try {
    if (switched && candidate) await candidate.query("UPDATE audit_logs SET action='RESTORE_ACTIVATION_REVERTED' WHERE action='RESTORE_ACTIVATED' AND details->>'operationId'=$1", [operationId]).catch(() => undefined);
    await candidate?.end(); candidate = null;
    if (switched) {
     await admin.query(`ALTER DATABASE ${identifier(nameOf(source))} ALLOW_CONNECTIONS false`); await terminate(nameOf(source));
     await admin.query("BEGIN");
     try { await rename(admin, nameOf(source), nameOf(target)); await rename(admin, retainedName, nameOf(source)); await admin.query("COMMIT"); } catch (rollbackError) { await admin.query("ROLLBACK"); throw rollbackError; }
    }
    await admin.query(`ALTER DATABASE ${identifier(nameOf(source))} ALLOW_CONNECTIONS true`);
    await admin.query(`ALTER DATABASE ${identifier(nameOf(target))} ALLOW_CONNECTIONS true`);
    const recovery = operationalPool(source.toString());
    try { const verified = await verifyDatabaseIntegrity(recovery); if (!verified.valid) throw new Error("Recovery integrity failed"); await recovery.query("INSERT INTO audit_logs(action,entity_type,entity_id,user_id,user_name,details) VALUES('RESTORE_ACTIVATION_ROLLED_BACK','database_backup',$1,$2,$3,$4)", [backupId,context.employeeId || context.userId || "operator",context.userName || "مدیر",JSON.stringify({ safetyBackupId, recoveryVerified: true })]); await recovery.query("UPDATE application_runtime_state SET maintenance_mode=false,operation=NULL,backup_id=NULL,updated_at=NOW() WHERE id='global'"); } finally { await recovery.end(); }
    await event("rollback_verified");
   } catch { await event("operator_recovery_required"); throw new ApiError(503, "سامانه در وضعیت بازیابی است. نسخه ایمنی و دیتابیس قبلی محفوظ‌اند؛ مسئول سرور باید انتقال را بررسی کند.", "RESTORE_RECOVERY_REQUIRED"); }
  } else if (locked) { await exitMaintenanceMode(); }
  await event("activation_failed");
  if (error instanceof ApiError) throw error;
  throw new ApiError(500, "انتقال ناموفق بود؛ دیتابیس قبلی حفظ شد.", "RESTORE_ACTIVATION_FAILED");
 } finally {
  await candidate?.end();
  if (locked) await admin.query("SELECT pg_advisory_unlock(761512, 2)");
  admin.release(); await adminPool.end();
 }
}
