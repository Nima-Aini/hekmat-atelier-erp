import { db } from "@/db";
import { sql } from "drizzle-orm";
import * as studioFinancialLinks from "./001_studio_financial_links";
import * as studioReconciliationIndexes from "./002_studio_reconciliation_indexes";
import * as studioAuthorizationAudit from "./003_studio_authorization_audit";
import * as studioConstraintsIndexes from "./004_studio_constraints_indexes";
import * as backupRecovery from "./005_backup_recovery";

import * as atelierProduct from "./006_atelier_product";
import * as atelierFinalWorkflow from "./007_atelier_final_workflow";

const migrations = [studioFinancialLinks, studioReconciliationIndexes, studioAuthorizationAudit, studioConstraintsIndexes, backupRecovery, atelierProduct, atelierFinalWorkflow] as const;
export const requiredMigrationIds = migrations.map((migration) => migration.id);

function rowCount(result: unknown) {
  if (result && typeof result === "object" && "rows" in result && Array.isArray((result as { rows: unknown }).rows)) return (result as { rows: unknown[] }).rows.length;
  if (Array.isArray(result) && result.length === 1 && result[0] && typeof result[0] === "object" && "rows" in result[0] && Array.isArray((result[0] as { rows: unknown }).rows)) return (result[0] as { rows: unknown[] }).rows.length;
  return Array.isArray(result) ? result.length : 0;
}

export async function runVersionedMigrations() {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS app_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMP DEFAULT NOW() NOT NULL)`);
  for (const migration of migrations) {
    const applied = await db.execute(sql`SELECT id FROM app_migrations WHERE id = ${migration.id} LIMIT 1`);
    if (rowCount(applied)) continue;
    await db.transaction(async (tx) => {
      await migration.up(tx);
      await tx.execute(sql`INSERT INTO app_migrations (id) VALUES (${migration.id}) ON CONFLICT (id) DO NOTHING`);
    });
  }
}
