import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Pool } from "pg";
import { pool } from "../src/db";
import { migrateDatabase } from "../src/db/migrate";
import { createSystemBackup, uploadSystemBackup, validateRestore, restoreBackupToIsolatedDatabase } from "../src/services/backup";
import { activateRestoredDatabase } from "../src/services/backupActivation";
import { LocalBackupStorage } from "../src/services/backupStorage";
const enabled = process.env.RUN_POSTGRES_RESTORE_DRILL === "true";
describe.skipIf(!enabled)("uploaded native archive and safety snapshot", () => {
 let directory: string; let storage: LocalBackupStorage; let targetName: string; let admin: Pool;
 const context = { userId: "upload_drill", userName: "Upload Drill" };
 beforeAll(async () => {
   await migrateDatabase(); directory = await mkdtemp(path.join(tmpdir(), "atelier-upload-native-")); storage = new LocalBackupStorage(directory);
   await pool.query("INSERT INTO roles(code,name) VALUES('admin','مدیر') ON CONFLICT(code) DO NOTHING");
   const employeeId = randomUUID();
   await pool.query("INSERT INTO employees(id,code,name,mobile) VALUES($1::uuid,$1::text,'مدیر تست','09120000009')", [employeeId]);
   await pool.query("INSERT INTO employee_accounts(employee_id,username,password_hash,role_id) SELECT $1,'restore_admin','test-hash',id FROM roles WHERE code='admin'", [employeeId]);
   targetName = `atelier_upload_${randomUUID().replaceAll("-", "")}`;
   admin = new Pool({ connectionString: process.env.POSTGRES_ADMIN_URL }); await admin.query(`CREATE DATABASE "${targetName}"`);
   const target = new URL(process.env.POSTGRES_ADMIN_URL!); target.pathname = `/${targetName}`; process.env.RESTORE_TARGET_DATABASE_URL = target.toString();
 }, 60000);
 afterAll(async () => { if (admin) { await admin.query(`DROP DATABASE IF EXISTS "${targetName}" WITH (FORCE)`); await admin.end(); } if (directory) await rm(directory, { recursive: true, force: true }); });
 it("rejects invalid and damaged archives without changing the live database", async () => {
   const before = (await pool.query("SELECT COUNT(*)::int AS n FROM customers")).rows[0].n;
   for (const data of ["not a dump", "PGDMPcorrupt"]) await expect(uploadSystemBackup(new Request("http://localhost", { method: "POST", body: data }), context, storage)).rejects.toThrow();
   expect((await pool.query("SELECT COUNT(*)::int AS n FROM customers")).rows[0].n).toBe(before);
 });
 it("uploads a real downloaded dump, validates it, preserves a fresh safety backup and verifies isolated restore", async () => {
   const original = await createSystemBackup(context, "native-upload-fixture", storage); const bytes = await readFile(await storage.resolve(original.id));
   const uploaded = await uploadSystemBackup(new Request("http://localhost", { method: "POST", body: bytes }), context, storage);
   expect(await validateRestore(uploaded.id, context, storage)).toMatchObject({ backupValid: true });
   await expect(restoreBackupToIsolatedDatabase(uploaded.id, "wrong", context, storage)).rejects.toMatchObject({ code: "RESTORE_CONFIRMATION_REQUIRED" });
   const originalDump = process.env.PG_DUMP_BIN;
   const { writeFile } = await import("node:fs/promises");
   const failingDump = path.join(directory, "pg_dump_fail"); await writeFile(failingDump, "#!/bin/sh\nexit 7\n", { mode: 0o700 });
   vi.stubEnv("PG_DUMP_BIN", failingDump);
   await expect(restoreBackupToIsolatedDatabase(uploaded.id, "RESTORE", context, storage)).rejects.toMatchObject({ code: "BACKUP_CREATE_FAILED" });
   if (originalDump === undefined) delete process.env.PG_DUMP_BIN; else process.env.PG_DUMP_BIN = originalDump;
   const lock = await pool.connect(); await lock.query("SELECT pg_advisory_lock(761512, 1)");
   try { await expect(restoreBackupToIsolatedDatabase(uploaded.id, "RESTORE", context, storage)).rejects.toMatchObject({ code: "RESTORE_BUSY" }); } finally { await lock.query("SELECT pg_advisory_unlock(761512, 1)"); lock.release(); }
   const restored = await restoreBackupToIsolatedDatabase(uploaded.id, "RESTORE", context, storage);
   expect(restored).toMatchObject({ targetVerified: true, switched: false, integrity: { valid: true } });
   expect(restored.safetyBackupId).not.toBe(original.id); expect(restored.safetyBackupId).not.toBe(uploaded.id);
   expect(await storage.resolve(restored.safetyBackupId!)).toContain(restored.safetyBackupId!);
   expect((await pool.query("SELECT maintenance_mode FROM application_runtime_state WHERE id='global'")).rows[0].maintenance_mode).toBe(false);
   process.env.RESTORE_ALLOW_ACTIVATION = "true";
   const marker = randomUUID(); await pool.query("INSERT INTO customers(id,code,name,mobile) VALUES($1::uuid,$1::text,'پس از بکاپ','09120000008')", [marker]);
   const failingStorage = new Proxy(storage, { get(target, prop) { if (prop === "writeMetadata") return async (id: string, metadata: any) => { if (metadata.kind === "restore_operation" && metadata.status === "activated_verified") throw new Error("simulated verification journal failure"); return target.writeMetadata(id, metadata); }; const value = Reflect.get(target, prop); return typeof value === "function" ? value.bind(target) : value; } });
   await expect(activateRestoredDatabase(uploaded.id, "RESTORE", context, failingStorage)).rejects.toMatchObject({ code: "RESTORE_ACTIVATION_FAILED" });
   expect((await pool.query("SELECT COUNT(*)::int n FROM customers WHERE id=$1", [marker])).rows[0].n).toBe(1);
   const activated = await activateRestoredDatabase(uploaded.id, "RESTORE", context, storage);
   expect(activated).toMatchObject({ activated: true, verified: true, sessionsInvalidated: true });
   expect((await pool.query("SELECT COUNT(*)::int n FROM employee_accounts WHERE session_invalid_before IS NOT NULL")).rows[0].n).toBeGreaterThan(0);
   expect((await pool.query("SELECT maintenance_mode FROM application_runtime_state WHERE id='global'")).rows[0].maintenance_mode).toBe(false);
   expect((await pool.query("SELECT COUNT(*)::int n FROM audit_logs WHERE action='RESTORE_ACTIVATED'")).rows[0].n).toBe(1);

 }, 120000);
});
