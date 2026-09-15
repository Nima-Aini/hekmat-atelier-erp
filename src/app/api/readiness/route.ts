import { NextResponse } from "next/server";
import { activeDatabaseDriver, db } from "@/db";
import { requiredMigrationIds } from "@/db/migrations";
import { sql } from "drizzle-orm";
import { getMaintenanceState } from "@/services/maintenance";
import { getRuntimeInfo } from "@/services/runtimeInfo";
import { getBackupStorage } from "@/services/backupStorage";

export function missingRequiredMigrations(appliedIds: Iterable<string>) {
  const applied = new Set(appliedIds);
  return requiredMigrationIds.filter((id) => !applied.has(id));
}

export async function GET() {
  const runtime = getRuntimeInfo();
  try {
    if (process.env.NODE_ENV === "production") getBackupStorage();
    if (await getMaintenanceState()) return NextResponse.json({ status: "not_ready", reason: "maintenance", gitSha: runtime.gitSha, schemaVersion: requiredMigrationIds.at(-1) || "baseline", environment: runtime.environment }, { status: 503 });
    await db.execute(sql`SELECT 1`);
    const result = await db.select({ id: sql<string>`id` }).from(sql`app_migrations`);
    const missing = missingRequiredMigrations(result.map((row) => row.id));
    if (missing.length) {
      return NextResponse.json({ status: "not_ready", gitSha: runtime.gitSha, schemaVersion: requiredMigrationIds.at(-1) || "baseline", environment: runtime.environment, database: { status: "connected", driver: activeDatabaseDriver }, migrations: { status: "missing", count: missing.length } }, { status: 503 });
    }
    return NextResponse.json({ status: "ready", gitSha: runtime.gitSha, schemaVersion: requiredMigrationIds.at(-1) || "baseline", environment: runtime.environment, database: { status: "connected", driver: activeDatabaseDriver }, migrations: { status: "current" }, config: { status: "valid" } });
  } catch (error) {
    console.error("Readiness check failed.", error);
    return NextResponse.json({ status: "not_ready", gitSha: runtime.gitSha, schemaVersion: requiredMigrationIds.at(-1) || "baseline", environment: runtime.environment, database: { status: "unavailable", driver: activeDatabaseDriver }, migrations: { status: "unknown" } }, { status: 503 });
  }
}
