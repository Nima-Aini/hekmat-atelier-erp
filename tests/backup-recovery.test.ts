import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import crypto, { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { activeDatabaseDriver, db } from "../src/db";
import { eq } from "drizzle-orm";
import { migrateDatabase } from "../src/db/migrate";
import { backups } from "../src/db/schema";
import { LocalBackupStorage, assertBackupId } from "../src/services/backupStorage";
import { applyBackupRetention, createSystemBackup, restoreBackupToIsolatedDatabase, validateRestore, verifySystemBackup } from "../src/services/backup";
import { enterMaintenanceMode, exitMaintenanceMode, getMaintenanceState } from "../src/services/maintenance";
import { proxy } from "../src/proxy";
import { GET as listBackups } from "../src/app/api/backups/route";
import { POST as restoreBackupRoute } from "../src/app/api/backups/[id]/restore/route";
import { GET as readiness } from "../src/app/api/readiness/route";
import { GET as health } from "../src/app/api/health/route";

const temporaryDirectories: string[] = [];
async function temporaryDirectory() { const directory = await mkdtemp(path.join(tmpdir(), "atelier-backup-test-")); temporaryDirectories.push(directory); return directory; }

describe("native backup and restore safety", () => {
  beforeAll(migrateDatabase);
  afterEach(async () => { vi.unstubAllEnvs(); await exitMaintenanceMode(); await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

  it("uses atomic local files with restrictive IDs and blocks traversal", async () => {
    const root = await temporaryDirectory(); const storage = new LocalBackupStorage(root); const id = randomUUID();
    const temporary = await storage.createTemporary(id); await temporary.handle.writeFile("safe archive"); await temporary.handle.close();
    const committed = await storage.commit(id, temporary.path); await storage.writeMetadata(id, { id });
    expect(await storage.resolve(id)).toBe(committed); expect(await storage.readMetadata(id)).toEqual({ id });
    expect(() => assertBackupId("../../etc/passwd")).toThrow("شناسه");
    vi.stubEnv("BACKUP_LOCAL_PATH", path.join(process.cwd(), "public", "backups"));
    const { getBackupStorage } = await import("../src/services/backupStorage"); expect(() => getBackupStorage()).toThrow("/public");
  });

  it("verifies SHA-256 and rejects a corrupted archive", async () => {
    const root = await temporaryDirectory(); const storage = new LocalBackupStorage(root); const id = randomUUID(); const archive = Buffer.from("PGDMP-test-archive");
    const temporary = await storage.createTemporary(id); await temporary.handle.writeFile(archive); await temporary.handle.close(); await storage.commit(id, temporary.path);
    const checksum = crypto.createHash("sha256").update(archive).digest("hex");
    await storage.writeMetadata(id, { backupId: id, checksum, format: "postgres_custom", formatVersion: 1 });
    await db.insert(backups).values({ id, filename: `${id}.dump`, sizeBytes: archive.length, sizeBytesBigint: archive.length, checksum, status: "completed", storageDriver: "local", storageKey: id, format: "postgres_custom", formatVersion: 1, schemaVersion: "011_atelier_finance_planning_polish" });
    const fakeRestore = path.join(root, "pg_restore"); await writeFile(fakeRestore, "#!/bin/sh\nexit 0\n", { mode: 0o700 }); vi.stubEnv("PG_RESTORE_BIN", fakeRestore);
    await expect(verifySystemBackup(id, undefined, storage)).resolves.toMatchObject({ valid: true, checksum });
    const report = await validateRestore(id, undefined, storage); expect(report).toMatchObject({ backupValid: true, checksumValid: true, readable: true, metadataValid: true });
    await writeFile(await storage.resolve(id), "corrupted");
    await expect(verifySystemBackup(id, undefined, storage)).rejects.toMatchObject({ status: 409, code: "BACKUP_CHECKSUM_MISMATCH" });
  });

  it("rejects unsupported schema versions and requires explicit restore intent", async () => {
    const root = await temporaryDirectory(); const storage = new LocalBackupStorage(root); const id = randomUUID(); const archive = Buffer.from("PGDMP-old-schema"); const checksum = crypto.createHash("sha256").update(archive).digest("hex");
    const temporary = await storage.createTemporary(id); await temporary.handle.writeFile(archive); await temporary.handle.close(); await storage.commit(id, temporary.path); await storage.writeMetadata(id, { backupId: id, checksum, format: "postgres_custom", formatVersion: 1 });
    await db.insert(backups).values({ id, filename: `${id}.dump`, sizeBytes: archive.length, checksum, status: "verified", storageDriver: "local", storageKey: id, format: "postgres_custom", formatVersion: 1, schemaVersion: "999_unsupported" });
    const fakeRestore = path.join(root, "pg_restore"); await writeFile(fakeRestore, "#!/bin/sh\nexit 0\n", { mode: 0o700 }); vi.stubEnv("PG_RESTORE_BIN", fakeRestore);
    expect(await validateRestore(id, undefined, storage)).toMatchObject({ backupValid: false, checksumValid: true, restoreRisk: "medium" });
    await expect(restoreBackupToIsolatedDatabase(id, "wrong", { userId: "test" }, storage)).rejects.toMatchObject({ status: 400, code: "RESTORE_CONFIRMATION_REQUIRED" });
  });

  it.skipIf(activeDatabaseDriver !== "pglite")("rejects backup creation on a non-PostgreSQL test driver", async () => {
    await expect(createSystemBackup({ userId: "test" }, undefined, new LocalBackupStorage(await temporaryDirectory()))).rejects.toMatchObject({ status: 422, code: "POSTGRES_BACKUP_REQUIRED" });
  });

  it("requires authentication for backup APIs and rejects unknown IDs", async () => {
    const response = await listBackups(); expect(response.status).toBe(401);
    const restoreResponse = await restoreBackupRoute(new Request("http://localhost/api/backups/test/restore", { method: "POST", body: JSON.stringify({ confirmation: "RESTORE" }) }), { params: Promise.resolve({ id: randomUUID() }) });
    expect(restoreResponse.status).toBe(401);
    const root = await temporaryDirectory(); vi.stubEnv("BACKUP_LOCAL_PATH", root);
    await expect(validateRestore(randomUUID())).rejects.toMatchObject({ status: 404, code: "BACKUP_NOT_FOUND" });
  });

  it("retention expires old files but always preserves the latest verified backup", async () => {
    const root = await temporaryDirectory(); const storage = new LocalBackupStorage(root); const oldId = randomUUID(); const latestId = randomUUID();
    for (const id of [oldId, latestId]) { const temporary = await storage.createTemporary(id); await temporary.handle.writeFile(id); await temporary.handle.close(); await storage.commit(id, temporary.path); await storage.writeMetadata(id, { backupId: id }); }
    await db.insert(backups).values([
      { id: oldId, filename: `${oldId}.dump`, sizeBytes: 1, checksum: "a".repeat(64), status: "verified", storageDriver: "local", storageKey: oldId, format: "postgres_custom", formatVersion: 1, createdAt: new Date("2098-01-01T00:00:00Z") },
      { id: latestId, filename: `${latestId}.dump`, sizeBytes: 1, checksum: "b".repeat(64), status: "verified", storageDriver: "local", storageKey: latestId, format: "postgres_custom", formatVersion: 1, createdAt: new Date("2099-01-01T00:00:00Z") },
    ]);
    vi.stubEnv("BACKUP_MAX_COUNT", "1"); vi.stubEnv("BACKUP_RETENTION_DAYS", "1"); await applyBackupRetention({ userId: "retention_test" }, storage);
    await expect(storage.resolve(latestId)).resolves.toContain(latestId); await expect(storage.resolve(oldId)).rejects.toMatchObject({ status: 404 });
    expect((await db.select().from(backups).where(eq(backups.id, oldId)))[0].status).toBe("expired");
  });

  it("blocks backend writes and readiness while maintenance is active", async () => {
    await enterMaintenanceMode(randomUUID()); expect((await getMaintenanceState())?.active).toBe(true);
    const mutationPaths = [
      "/api/studio/projects",
      `/api/studio/projects/${randomUUID()}/contracts`,
      `/api/studio/projects/${randomUUID()}/payments`,
      `/api/studio/projects/${randomUUID()}/expenses`,
      `/api/studio/personnel/${randomUUID()}/salary/${randomUUID()}`,
      "/api/studio/equipment/reservations",
      `/api/studio/projects/${randomUUID()}/execution`,
    ];
    for (const requestPath of mutationPaths) {
      const response = await proxy(new NextRequest(`http://localhost${requestPath}`, { method: "POST" }));
      expect(response.status).toBe(503); expect(response.headers.get("Retry-After")).toBe("60");
    }
    const live = await health(); expect(live.status).toBe(200); expect((await live.json()).process).toBe("alive");
    const ready = await readiness(); expect(ready.status).toBe(503); expect((await ready.json()).reason).toBe("maintenance");
  });

  it("reports safe deployment and schema identity in readiness", async () => {
    vi.stubEnv("GIT_SHA", "bb22e48c2299ddbefe6cee6854a21e6798a2e2df"); vi.stubEnv("APP_ENV", "staging");
    const response = await readiness(); const body = await response.json();
    expect(response.status).toBe(200); expect(body).toMatchObject({ status: "ready", gitSha: "bb22e48c2299ddbefe6cee6854a21e6798a2e2df", schemaVersion: "011_atelier_finance_planning_polish", environment: "staging" });
    expect(JSON.stringify(body)).not.toMatch(/password|DATABASE_URL/i);
  });
});
