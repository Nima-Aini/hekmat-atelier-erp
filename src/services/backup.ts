import crypto, { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat, statfs } from "node:fs/promises";
import { spawn } from "node:child_process";
import { Pool } from "pg";
import { and, desc, eq, ne } from "drizzle-orm";
import { activeDatabaseDriver, db, pool } from "@/db";
import { backups } from "@/db/schema";
import { statements as upgradeStatements, id as upgradeMigrationId } from "@/db/migrations/015_appearance_reservation_managers";
import { requiredMigrationIds } from "@/db/migrations";
import { ApiError } from "@/lib/apiError";
import { logAuditEvent, type AuditContext } from "@/services/audit";
import { assertBackupId, getBackupStorage, type BackupStorage } from "@/services/backupStorage";
import { enterMaintenanceMode, exitMaintenanceMode } from "@/services/maintenance";
import { getRuntimeInfo } from "@/services/runtimeInfo";
import { verifyDatabaseIntegrity } from "@/services/databaseIntegrity";

export const BACKUP_FORMAT = "postgres_custom";
export const BACKUP_FORMAT_VERSION = 1;
const LEGACY_SCHEMA = "014_atelier_advanced_workflow";
const SHA256 = /^[0-9a-f]{64}$/i;
const safeDiagnostic = (error: unknown) => ({ message: (error instanceof Error ? error.message : "unknown error").replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, "postgresql://[REDACTED]@"), code: error instanceof ApiError ? error.code : undefined });

export type BackupMetadata = {
  backupId: string; createdAt: string; applicationVersion: string; gitSha: string;
  schemaVersion: string; databaseDriver: "postgres"; format: typeof BACKUP_FORMAT;
  formatVersion: typeof BACKUP_FORMAT_VERSION; checksum: string; sizeBytes: number;
  createdBy: string | null; notes: string | null;
};

export type RestoreValidation = {
  backupValid: boolean; checksumValid: boolean; readable: boolean; formatSupported: boolean;
  metadataValid: boolean; backupSchemaVersion: string; currentSupportedSchemaVersion: string;
  gitSha: string; sizeBytes: number; restoreRisk: "low" | "medium" | "high"; warnings: string[];
};

function databaseUrl(name = "DATABASE_URL") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  const parsed = new URL(value);
  if (!/^(postgres|postgresql):$/.test(parsed.protocol)) throw new Error(`${name} must be PostgreSQL.`);
  return parsed;
}

function postgresEnvironment(url: URL) {
  const env = { ...process.env };
  env.PGHOST = url.hostname; env.PGPORT = url.port || "5432";
  env.PGUSER = decodeURIComponent(url.username); env.PGPASSWORD = decodeURIComponent(url.password);
  env.PGDATABASE = decodeURIComponent(url.pathname.slice(1));
  const sslMode = url.searchParams.get("sslmode"); if (sslMode) env.PGSSLMODE = sslMode;
  delete env.DATABASE_URL; delete env.RESTORE_TARGET_DATABASE_URL;
  return env;
}

function safeTool(name: "pg_dump" | "pg_restore") {
  const configured = process.env[name === "pg_dump" ? "PG_DUMP_BIN" : "PG_RESTORE_BIN"]?.trim();
  if (!configured) return name;
  if (!/^(?:[A-Za-z]:[\\/]|\/)[\w./\\-]+$/.test(configured)) throw new Error(`Invalid ${name} executable path.`);
  return configured;
}

async function runTool(name: "pg_dump" | "pg_restore", args: string[], url?: URL, outputFd?: number) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(safeTool(name), args, { shell: false, env: url ? postgresEnvironment(url) : { ...process.env, DATABASE_URL: undefined, RESTORE_TARGET_DATABASE_URL: undefined }, stdio: ["ignore", outputFd === undefined ? "pipe" : outputFd, "pipe"] });
    let stderr = ""; let stdout = "";
    child.stdout?.on("data", chunk => { stdout += String(chunk); if (stdout.length > 8 * 1024 * 1024) child.kill(); });
    child.stderr?.on("data", (chunk) => { if (stderr.length < 8192) stderr += String(chunk); });
    child.on("error", (error) => reject(new Error(`${name} could not start: ${error.message}`)));
    child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(`${name} failed with exit code ${code}: ${stderr.slice(0, 2000)}`)));
  });
}

async function sha256(file: string) {
  return new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash("sha256"); const stream = createReadStream(file);
    stream.on("error", reject); stream.on("data", (chunk) => hash.update(chunk)); stream.on("end", () => resolve(hash.digest("hex")));
  });
}

const currentSchemaVersion = () => requiredMigrationIds.at(-1) || "baseline";
async function assertMigrationsCurrent() {
  const result = await pool.query("SELECT id FROM app_migrations");
  const applied = new Set(result.rows.map((row) => String(row.id)));
  const missing = requiredMigrationIds.filter((id) => !applied.has(id));
  if (missing.length) throw new ApiError(422, "تا تکمیل migrationها امکان تهیه نسخه پشتیبان وجود ندارد.", "BACKUP_MIGRATIONS_INCOMPLETE");
}
function publicBackup(row: typeof backups.$inferSelect) {
  return { ...row, backupData: undefined, storageKey: undefined, failureReason: row.failureReason ? "عملیات ناموفق بود؛ جزئیات در لاگ سرور ثبت شده است." : null };
}

export async function createSystemBackup(context: AuditContext, notes?: string, storage: BackupStorage = getBackupStorage()) {
  if (activeDatabaseDriver !== "postgres") throw new ApiError(422, "نسخه پشتیبان عملیاتی فقط برای PostgreSQL قابل ایجاد است.", "POSTGRES_BACKUP_REQUIRED");
  await assertMigrationsCurrent();
  const id = randomUUID(); const createdAt = new Date(); const schemaVersion = currentSchemaVersion(); const runtime = getRuntimeInfo();
  const filename = `hekmat-atelier-${createdAt.toISOString().replace(/[:.]/g, "-")}-${id}.dump`;
  const cleanNotes = typeof notes === "string" ? notes.trim().slice(0, 1000) || null : null;
  await db.insert(backups).values({ id, filename, sizeBytes: 0, checksum: "pending", status: "pending", storageDriver: storage.driver, storageKey: id, format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION, schemaVersion, gitSha: runtime.gitSha, databaseDriver: activeDatabaseDriver, createdById: context.employeeId || null, notes: cleanNotes, metadata: {} });
  let temporary: Awaited<ReturnType<BackupStorage["createTemporary"]>> | null = null;
  try {
    const databaseSize = Number((await pool.query("SELECT pg_database_size(current_database())::bigint AS size")).rows[0]?.size || 0);
    const requiredStorage = Math.max(64 * 1024 * 1024, Math.ceil(databaseSize * 1.25));
    await storage.preflight(requiredStorage);
    await db.update(backups).set({ status: "running" }).where(eq(backups.id, id));
    temporary = await storage.createTemporary(id);
    await runTool("pg_dump", ["--format=custom", "--no-owner", "--no-acl"], databaseUrl(), temporary.handle.fd);
    await temporary.handle.sync(); await temporary.handle.close();
    const file = await storage.commit(id, temporary.path);
    const [checksum, fileInfo] = await Promise.all([sha256(file), stat(file)]);
    await db.update(backups).set({ status: "completed", checksum, sizeBytes: Math.min(fileInfo.size, 2147483647), sizeBytesBigint: fileInfo.size }).where(eq(backups.id, id));
    await runTool("pg_restore", ["--list", file]);
    const metadata: BackupMetadata = { backupId: id, createdAt: createdAt.toISOString(), applicationVersion: runtime.applicationVersion, gitSha: runtime.gitSha, schemaVersion, databaseDriver: "postgres", format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION, checksum, sizeBytes: fileInfo.size, createdBy: context.employeeId || null, notes: cleanNotes };
    await storage.writeMetadata(id, metadata);
    const [updated] = await db.update(backups).set({ status: "verified", checksum, sizeBytes: Math.min(fileInfo.size, 2147483647), sizeBytesBigint: fileInfo.size, verifiedAt: new Date(), metadata }).where(eq(backups.id, id)).returning();
    await logAuditEvent("BACKUP_VERIFIED", "database_backup", id, { checksum, sizeBytes: fileInfo.size, schemaVersion, format: BACKUP_FORMAT }, context);
    console.info("backup.completed", { backupId: id, sizeBytes: fileInfo.size, schemaVersion, gitSha: runtime.gitSha });
    await applyBackupRetention(context, storage);
    return publicBackup(updated);
  } catch (error) {
    try { await temporary?.handle.close(); } catch { /* already closed */ }
    try { await storage.remove(id); } catch (cleanupError) { console.error("backup.cleanup_failed", { backupId: id, ...safeDiagnostic(cleanupError) }); }
    await db.update(backups).set({ status: "failed", failureReason: error instanceof Error ? error.message.slice(0, 2000) : "unknown failure" }).where(eq(backups.id, id));
    await logAuditEvent("BACKUP_FAILED", "database_backup", id, { schemaVersion, result: "failed" }, context);
    console.error("backup.failed", { backupId: id, ...safeDiagnostic(error) });
    throw new ApiError(500, "ایجاد نسخه پشتیبان ناموفق بود.", "BACKUP_CREATE_FAILED");
  }
}

export async function getBackupsList() { return (await db.select().from(backups).orderBy(desc(backups.createdAt))).map(publicBackup); }
export async function getBackupById(id: string) { assertBackupId(id); const [row] = await db.select().from(backups).where(eq(backups.id, id)).limit(1); return row ? publicBackup(row) : null; }

async function storedBackup(id: string) {
  assertBackupId(id); const [row] = await db.select().from(backups).where(eq(backups.id, id)).limit(1);
  if (!row || row.storageDriver !== "local" || row.format !== BACKUP_FORMAT) throw new ApiError(404, "نسخه پشتیبان عملیاتی یافت نشد.", "BACKUP_NOT_FOUND");
  return row;
}

export async function verifySystemBackup(id: string, context?: AuditContext, storage: BackupStorage = getBackupStorage()) {
  const row = await storedBackup(id); const file = await storage.resolve(id);
  const [checksum, info] = await Promise.all([sha256(file), stat(file)]);
  const valid = SHA256.test(row.checksum) && checksum === row.checksum && info.size === Number(row.sizeBytesBigint || row.sizeBytes);
  if (valid) await runTool("pg_restore", ["--list", file]);
  if (context) await logAuditEvent(valid ? "BACKUP_VERIFY_SUCCEEDED" : "BACKUP_VERIFY_FAILED", "database_backup", id, { checksum: row.checksum, sizeBytes: info.size }, context);
  if (!valid) throw new ApiError(409, "Checksum نسخه پشتیبان مطابقت ندارد.", "BACKUP_CHECKSUM_MISMATCH");
  await db.update(backups).set({ status: "verified", verifiedAt: new Date() }).where(eq(backups.id, id));
  return { valid: true, checksum, sizeBytes: info.size, schemaVersion: row.schemaVersion };
}

export async function validateRestore(id: string, context?: AuditContext, storage: BackupStorage = getBackupStorage()): Promise<RestoreValidation> {
  const row = await storedBackup(id); const warnings: string[] = [];
  let checksumValid = false, readable = false, metadataValid = false, sizeBytes = 0;
  try {
    const file = await storage.resolve(id); const info = await stat(file); sizeBytes = info.size; checksumValid = (await sha256(file)) === row.checksum;
    try { const filesystem = await statfs(file); const available = Number(filesystem.bavail) * Number(filesystem.bsize); if (available < sizeBytes * 2) warnings.push("Local storage headroom is below twice the archive size."); } catch { warnings.push("Available local storage could not be determined."); }
    if (checksumValid) { await runTool("pg_restore", ["--list", file]); readable = true; }
    const metadata = await storage.readMetadata(id) as Partial<BackupMetadata>;
    metadataValid = metadata.backupId === id && metadata.checksum === row.checksum && metadata.format === BACKUP_FORMAT && metadata.formatVersion === BACKUP_FORMAT_VERSION;
  } catch { /* represented in report */ }
  const supported = currentSchemaVersion(); const formatSupported = row.format === BACKUP_FORMAT && row.formatVersion === BACKUP_FORMAT_VERSION;
  if (row.schemaVersion !== supported) warnings.push(`Backup schema ${row.schemaVersion || "unknown"} differs from supported schema ${supported}.`);
  if (!checksumValid) warnings.push("Checksum mismatch."); if (!readable) warnings.push("pg_restore could not read the archive catalog."); if (!metadataValid) warnings.push("Application metadata is missing or inconsistent.");
  const backupValid = checksumValid && readable && metadataValid && formatSupported && (row.schemaVersion === supported || row.schemaVersion === LEGACY_SCHEMA);
  const report: RestoreValidation = { backupValid, checksumValid, readable, formatSupported, metadataValid, backupSchemaVersion: row.schemaVersion || "unknown", currentSupportedSchemaVersion: supported, gitSha: row.gitSha || "unknown", sizeBytes, restoreRisk: backupValid ? "low" : checksumValid && readable ? "medium" : "high", warnings };
  if (context) await logAuditEvent("RESTORE_VALIDATED", "database_backup", id, { backupChecksum: row.checksum, sourceSchemaVersion: row.schemaVersion, targetSchemaVersion: supported, result: backupValid ? "valid" : "invalid", validation: report }, context);
  return report;
}

function databaseIdentity(url: URL) { return `${url.hostname.toLowerCase()}:${url.port || "5432"}/${decodeURIComponent(url.pathname.slice(1))}`; }

export async function restoreBackupToIsolatedDatabase(id: string, confirmation: unknown, context: AuditContext, storage: BackupStorage = getBackupStorage()) {
  if (confirmation !== "RESTORE") throw new ApiError(400, "برای تأیید بازیابی باید عبارت RESTORE وارد شود.", "RESTORE_CONFIRMATION_REQUIRED");
  const report = await validateRestore(id, context, storage); if (!report.backupValid) throw new ApiError(422, "نسخه پشتیبان برای بازیابی معتبر نیست.", "RESTORE_VALIDATION_FAILED");
  const source = databaseUrl(); const target = databaseUrl("RESTORE_TARGET_DATABASE_URL");
  if (databaseIdentity(source) === databaseIdentity(target)) throw new ApiError(422, "بازیابی روی دیتابیس در حال اجرا ممنوع است.", "RESTORE_TARGET_MUST_BE_ISOLATED");
  const row = await storedBackup(id); const targetPool = new Pool({ connectionString: target.toString(), max: 1, options: "-c timezone=UTC" }); const startedAt = new Date();
  targetPool.on("error", (error: { code?: string }) => console.error("restore.target_connection_closed", { code: error.code || "CONNECTION_CLOSED" }));
  const lock = await pool.connect();
  const acquired = await lock.query("SELECT pg_try_advisory_lock(761512, 1) AS locked");
  if (!acquired.rows[0]?.locked) { lock.release(); await targetPool.end(); throw new ApiError(409, "یک بازیابی دیگر در حال اجراست.", "RESTORE_BUSY"); }
  let safetyBackupId: string | null = null;
  try {
  await logAuditEvent("RESTORE_STARTED", "database_backup", id, { backupChecksum: row.checksum, sourceSchemaVersion: row.schemaVersion, targetSchemaVersion: report.currentSupportedSchemaVersion, startedAt: startedAt.toISOString() }, context);
    await enterMaintenanceMode(id);
    const safety = await createSystemBackup(context, `pre-restore:${id}`, storage);
    await verifySystemBackup(safety.id, context, storage);
    await storage.resolve(safety.id);
    safetyBackupId = safety.id;
    await logAuditEvent("RESTORE_SAFETY_BACKUP_READY", "database_backup", id, { safetyBackupId, checksum: safety.checksum }, context);
    const role = (await targetPool.query("SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication FROM pg_roles WHERE rolname=current_user")).rows[0];
    const disposableTest = process.env.NODE_ENV === "test" && process.env.ALLOW_TEST_DATABASE === "true" && process.env.TEST_DATABASE_URL === process.env.DATABASE_URL;
    if (!disposableTest && (role?.rolsuper || role?.rolcreatedb || role?.rolcreaterole || role?.rolreplication)) throw new ApiError(422, "حساب بازیابی فایل باید محدود و بدون دسترسی مدیریتی PostgreSQL باشد.", "RESTORE_RESTRICTED_ROLE_REQUIRED");
    const tableCount = await targetPool.query("SELECT COUNT(*)::int AS count FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') AND schemaname !~ '^pg_toast'");
    if (Number(tableCount.rows[0]?.count || 0) !== 0) throw new ApiError(409, "دیتابیس مقصد باید خالی و مجزا باشد.", "RESTORE_TARGET_NOT_EMPTY");
    const file = await storage.resolve(id);
    await runTool("pg_restore", ["--exit-on-error", "--single-transaction", "--no-owner", "--no-acl", "--dbname", decodeURIComponent(target.pathname.slice(1)), file], target);
    if (row.schemaVersion === LEGACY_SCHEMA) {
      await targetPool.query("BEGIN");
      try { for (const statement of upgradeStatements) await targetPool.query(statement); await targetPool.query("INSERT INTO app_migrations(id) VALUES($1) ON CONFLICT DO NOTHING", [upgradeMigrationId]); await targetPool.query("COMMIT"); } catch (error) { await targetPool.query("ROLLBACK"); throw error; }
    }
    const migrationRows = await targetPool.query("SELECT id FROM app_migrations ORDER BY id"); const applied = new Set(migrationRows.rows.map((item) => String(item.id))); const missing = requiredMigrationIds.filter((migration) => !applied.has(migration));
    if (missing.length) throw new ApiError(422, "مهاجرت‌های لازم در دیتابیس بازیابی‌شده کامل نیستند.", "RESTORE_MIGRATIONS_MISSING");
    const integrity = await verifyDatabaseIntegrity(targetPool); if (!integrity.valid) throw new ApiError(422, "بررسی یکپارچگی دیتابیس بازیابی‌شده ناموفق بود.", "RESTORE_INTEGRITY_FAILED");
    const finishedAt = new Date();
    await logAuditEvent("RESTORE_TARGET_VERIFIED", "database_backup", id, { backupChecksum: row.checksum, sourceSchemaVersion: row.schemaVersion, targetSchemaVersion: report.currentSupportedSchemaVersion, safetyBackupId, startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(), result: "verified", integrity }, context);
    console.info("restore.target_verified", { backupId: id, schemaVersion: row.schemaVersion, durationMs: finishedAt.getTime() - startedAt.getTime() });
    return { restored: true, targetVerified: true, switched: false, safetyBackupId, integrity, warning: "Database switch is an explicit infrastructure operation and was not performed automatically." };
  } catch (error) {
    await logAuditEvent("RESTORE_FAILED", "database_backup", id, { backupChecksum: row.checksum, sourceSchemaVersion: row.schemaVersion, targetSchemaVersion: report.currentSupportedSchemaVersion, safetyBackupId, liveDatabaseChanged: false, startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), result: "failed", failureCode: error instanceof ApiError ? error.code : "UNEXPECTED" }, context);
    console.error("restore.failed", { backupId: id, ...safeDiagnostic(error) }); throw error;
  } finally { try { await targetPool.end(); await exitMaintenanceMode(); } finally { await lock.query("SELECT pg_advisory_unlock(761512, 1)"); lock.release(); } }
}

export async function getBackupDownload(id: string, storage: BackupStorage = getBackupStorage()) {
  const row = await storedBackup(id); if (!["completed", "verified"].includes(row.status)) throw new ApiError(409, "نسخه پشتیبان هنوز قابل دریافت نیست.", "BACKUP_NOT_READY");
  return { row, path: await storage.resolve(id) };
}

export async function deleteSystemBackup(id: string, context: AuditContext, storage: BackupStorage = getBackupStorage()) {
  const row = await storedBackup(id);
  if (row.notes?.startsWith("pre-restore:")) throw new ApiError(409, "نسخه ایمنی بازیابی قابل حذف نیست.");
  if (row.status === "verified") { const other = await db.select({ id: backups.id }).from(backups).where(and(eq(backups.status, "verified"), ne(backups.id, id))).limit(1); if (!other.length) throw new ApiError(409, "آخرین نسخه پشتیبان تأییدشده قابل حذف نیست.", "LAST_VERIFIED_BACKUP"); }
  await storage.remove(id); await db.update(backups).set({ status: "deleted", storageKey: null }).where(eq(backups.id, id));
  await logAuditEvent("BACKUP_DELETED", "database_backup", id, { checksum: row.checksum, sizeBytes: row.sizeBytesBigint || row.sizeBytes }, context);
}

export async function applyBackupRetention(context: AuditContext, storage: BackupStorage = getBackupStorage()) {
  const maxCount = Math.max(1, Number.parseInt(process.env.BACKUP_MAX_COUNT || "30", 10) || 30); const retentionDays = Math.max(1, Number.parseInt(process.env.BACKUP_RETENTION_DAYS || "30", 10) || 30); const cutoff = Date.now() - retentionDays * 86400000;
  const verified = await db.select().from(backups).where(eq(backups.status, "verified")).orderBy(desc(backups.createdAt));
  for (let index = 1; index < verified.length; index++) { const row = verified[index]; if (row.notes?.startsWith("pre-restore:")) continue; if (index < maxCount && row.createdAt.getTime() >= cutoff) continue; await storage.remove(row.id); await db.update(backups).set({ status: "expired", storageKey: null }).where(eq(backups.id, row.id)); await logAuditEvent("BACKUP_EXPIRED", "database_backup", row.id, { checksum: row.checksum, createdAt: row.createdAt.toISOString() }, context); }
}

export const MAX_BACKUP_UPLOAD = 128 * 1024 * 1024;
export async function uploadSystemBackup(request: Request, context: AuditContext, storage: BackupStorage = getBackupStorage()) {
  if (activeDatabaseDriver !== "postgres") throw new ApiError(422, "آپلود بکاپ عملیاتی فقط برای PostgreSQL پشتیبانی می‌شود.");
  const length = Number(request.headers.get("content-length"));
  if (!request.body || (Number.isFinite(length) && length > MAX_BACKUP_UPLOAD)) throw new ApiError(413, "حداکثر حجم نسخه پشتیبان ۱۲۸ مگابایت است.");
  const id = randomUUID(); await storage.preflight(MAX_BACKUP_UPLOAD * 2);
  const temporary = await storage.createTemporary(id); let size = 0; let committed = false;
  const reader = request.body.getReader();
  try {
    const hash = crypto.createHash("sha256"); let magic = Buffer.alloc(0);
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > MAX_BACKUP_UPLOAD) { await reader.cancel(); throw new ApiError(413, "حجم فایل بیشتر از حد مجاز است."); }
      if (magic.length < 5) magic = Buffer.concat([magic, Buffer.from(value)]).subarray(0, 5);
      if (magic.length === 5 && magic.toString("ascii") !== "PGDMP") throw new ApiError(422, "فرمت فایل پشتیبانی نمی‌شود؛ فایل .dump دریافت‌شده از سامانه را انتخاب کنید.");
      hash.update(value); await temporary.handle.writeFile(value);
    }
    if (size < 6 || magic.toString("ascii") !== "PGDMP") throw new ApiError(422, "نسخه پشتیبان ناقص است.");
    await temporary.handle.sync(); await temporary.handle.close();
    const catalog = await runTool("pg_restore", ["--list", temporary.path]);
    if (!catalog.includes("TABLE DATA public app_migrations")) throw new ApiError(422, "اطلاعات نسخه سامانه در فایل وجود ندارد.");
    const migrationData = await runTool("pg_restore", ["--data-only", "--table=app_migrations", "--file=-", temporary.path]);
    const unknownMigrations = migrationData.split("\n").map(row => row.split("\t")[0]).filter(value => /^\d{3}_/.test(value) && !requiredMigrationIds.some(id => id === value));
    if (unknownMigrations.length) throw new ApiError(422, "ساختار نسخه پشتیبان جدیدتر یا ناشناخته است.", "BACKUP_SCHEMA_INCOMPATIBLE");
    const applied = requiredMigrationIds.filter(migration => migrationData.split("\n").some(row => row.split("\t")[0] === migration));
    if (applied.length < requiredMigrationIds.length - 1 || !applied.includes(LEGACY_SCHEMA)) throw new ApiError(422, "نسخه ساختار فایل با سامانه سازگار نیست؛ ابتدا نسخه پشتیبان باید در محیط جدا ارتقا داده شود.", "BACKUP_SCHEMA_INCOMPATIBLE");
    const checksum = hash.digest("hex"); const schemaVersion = applied.includes(upgradeMigrationId) ? currentSchemaVersion() : LEGACY_SCHEMA;
    await storage.commit(id, temporary.path); committed = true;
    const metadata: BackupMetadata = { backupId: id, createdAt: new Date().toISOString(), applicationVersion: "uploaded", gitSha: "unknown", schemaVersion, databaseDriver: "postgres", format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION, checksum, sizeBytes: size, createdBy: context.employeeId || null, notes: "uploaded archive; original creation date unknown" };
    await storage.writeMetadata(id, metadata);
    const [row] = await db.insert(backups).values({ id, filename: `uploaded-${id}.dump`, sizeBytes: size, sizeBytesBigint: size, checksum, status: "verified", storageDriver: storage.driver, storageKey: id, format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION, schemaVersion, gitSha: "unknown", databaseDriver: "postgres", createdById: context.employeeId || null, verifiedAt: new Date(), metadata }).returning();
    await logAuditEvent("BACKUP_UPLOADED", "database_backup", id, { checksum, sizeBytes: size, schemaVersion }, context);
    return publicBackup(row);
  } catch (error) {
    await temporary.handle.close().catch(() => undefined); await storage.remove(id).catch(() => undefined);
    if (committed) await db.delete(backups).where(eq(backups.id, id));
    if (error instanceof ApiError) throw error;
    throw new ApiError(422, "خواندن فایل پشتیبان ممکن نشد؛ فایل آسیب‌دیده یا ناسازگار است.", "BACKUP_UPLOAD_INVALID");
  } finally { reader.releaseLock(); }
}
