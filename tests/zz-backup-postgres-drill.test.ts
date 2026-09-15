import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { db, pool } from "../src/db";
import { migrateDatabase } from "../src/db/migrate";
import { requiredMigrationIds } from "../src/db/migrations";
import { accounts, studioCalendarEvents, studioProductionPlans, studioProductionSteps } from "../src/db/schema";
import { missingRequiredMigrations } from "../src/app/api/readiness/route";
import { createStudioCustomer } from "../src/services/studio/customerService";
import { createStudioEquipment, reserveStudioEquipment } from "../src/services/studio/equipmentService";
import { createStudioPersonnel, updatePersonnelSalaryStatus } from "../src/services/studio/personnelService";
import { addRentalToProject, assignPersonnelToProject, createStudioContract, createStudioExpense, createStudioPayment, createStudioProject, getStudioProjectById } from "../src/services/studio/projectService";
import { createSystemBackup, restoreBackupToIsolatedDatabase, validateRestore } from "../src/services/backup";
import { getBackupStorage } from "../src/services/backupStorage";

const enabled = process.env.RUN_POSTGRES_RESTORE_DRILL === "true";

async function one(client: Pool, sql: string, values: unknown[]) {
  return (await client.query(sql, values)).rows[0];
}

async function snapshot(client: Pool, ids: Record<string, string>) {
  return {
    coreProject: await one(client, "SELECT id, code, name, status, created_at FROM projects WHERE id=$1", [ids.coreProject]),
    customer: await one(client, "SELECT id, code, name, mobile, status, created_at FROM customers WHERE id=$1", [ids.customer]),
    studioCustomer: await one(client, "SELECT id, customer_id, created_at FROM studio_customers WHERE id=$1", [ids.studioCustomer]),
    studioProject: await one(client, "SELECT id, project_id, studio_customer_id, title, status, event_date, created_at FROM studio_projects WHERE id=$1", [ids.studioProject]),
    contract: await one(client, "SELECT id, studio_project_id, invoice_id, total_amount, deposit_amount, status, created_at FROM studio_contracts WHERE id=$1", [ids.contract]),
    invoice: await one(client, "SELECT id, customer_id, project_id, grand_total, paid_amount, balance_due, status, created_at FROM invoices WHERE id=$1", [ids.invoice]),
    invoiceItems: await one(client, "SELECT COUNT(*)::int AS count, COALESCE(SUM(line_total),0)::numeric AS total FROM invoice_items WHERE invoice_id=$1", [ids.invoice]),
    studioPayment: await one(client, "SELECT id, studio_project_id, payment_id, invoice_id, account_id, amount, financial_status, paid_at FROM studio_project_payments WHERE id=$1", [ids.studioPayment]),
    payment: await one(client, "SELECT id, invoice_id, project_id, account_id, amount, payment_type, status, payment_date FROM payments WHERE id=$1", [ids.payment]),
    allocation: await one(client, "SELECT payment_id, invoice_id, allocated_amount FROM payment_allocations WHERE payment_id=$1", [ids.payment]),
    studioExpense: await one(client, "SELECT id, studio_project_id, expense_id, payment_id, account_id, amount, financial_status, paid_at FROM studio_project_expenses WHERE id=$1", [ids.studioExpense]),
    expense: await one(client, "SELECT id, project_id, account_id, payment_id, amount, category, status, expense_date FROM expenses WHERE id=$1", [ids.expense]),
    rental: await one(client, "SELECT id, studio_project_id, expense_id, payment_id, account_id, rental_cost, financial_status, pickup_date, return_date FROM rental_equipment WHERE id=$1", [ids.rental]),
    person: await one(client, "SELECT id, full_name, mobile, primary_role, status, created_at FROM studio_personnel WHERE id=$1", [ids.person]),
    wage: await one(client, "SELECT id, personnel_id, studio_project_id, payment_id, account_id, total_calculated, payment_status, financial_status, settlement_date FROM personnel_salary_records WHERE id=$1", [ids.wage]),
    equipment: await one(client, "SELECT id, code, title, category, current_health_status, created_at FROM studio_equipment WHERE id=$1", [ids.equipment]),
    reservation: await one(client, "SELECT id, equipment_id, studio_project_id, assigned_personnel_id, reserved_from, reserved_to, status FROM equipment_reservations WHERE id=$1", [ids.reservation]),
    plan: await one(client, "SELECT id, studio_project_id, target_delivery_date, current_stage, created_at FROM studio_production_plans WHERE id=$1", [ids.plan]),
    step: await one(client, "SELECT id, plan_id, assigned_personnel_id, step_name, status, deadline FROM studio_production_steps WHERE id=$1", [ids.step]),
    calendar: await one(client, "SELECT id, studio_project_id, title, start_time, end_time, status FROM studio_calendar_events WHERE id=$1", [ids.calendar]),
    timeline: await one(client, "SELECT COUNT(*)::int AS count FROM studio_project_timelines WHERE studio_project_id=$1", [ids.studioProject]),
    audit: await one(client, "SELECT COUNT(*)::int AS count FROM audit_logs WHERE project_id=$1 OR entity_id=ANY($2::uuid[])", [ids.coreProject, [ids.contract, ids.studioPayment, ids.studioExpense]]),
    migrations: (await client.query("SELECT id FROM app_migrations ORDER BY id")).rows.map((row) => row.id),
    account: await one(client, "SELECT id, code, balance, status, created_at FROM accounts WHERE id=$1", [ids.account]),
  };
}

async function financialSnapshot(client: Pool, coreProjectId: string, accountId: string) {
  const result = await client.query(`SELECT
    COALESCE((SELECT SUM(grand_total) FROM invoices WHERE project_id=$1 AND status='issued'),0)::numeric AS invoiced,
    COALESCE((SELECT SUM(amount) FROM payments WHERE project_id=$1 AND status='completed' AND payment_type='customer_receipt'),0)::numeric AS collected,
    COALESCE((SELECT SUM(amount) FROM expenses WHERE project_id=$1 AND status='posted'),0)::numeric AS cost,
    COALESCE((SELECT SUM(balance_due) FROM invoices WHERE project_id=$1 AND status='issued'),0)::numeric AS outstanding,
    (SELECT balance FROM accounts WHERE id=$2)::numeric AS account_balance`, [coreProjectId, accountId]);
  const row = result.rows[0];
  return { invoiced: Number(row.invoiced), collected: Number(row.collected), cost: Number(row.cost), grossProfit: Number(row.invoiced) - Number(row.cost), outstanding: Number(row.outstanding), accountBalance: Number(row.account_balance) };
}

describe.skipIf(!enabled)("PostgreSQL native backup restore drill", () => {
  let admin: Pool;
  let target: Pool;
  let targetName = "";
  let backupDirectory = "";

  beforeAll(async () => {
    if (!process.env.POSTGRES_ADMIN_URL || !process.env.DATABASE_URL) throw new Error("POSTGRES_ADMIN_URL and DATABASE_URL are required for restore drill.");
    await migrateDatabase();
    backupDirectory = await mkdtemp(path.join(tmpdir(), "atelier-restore-drill-"));
    process.env.BACKUP_STORAGE_DRIVER = "local";
    process.env.BACKUP_LOCAL_PATH = backupDirectory;
    targetName = `atelier_restore_${randomUUID().replaceAll("-", "")}`;
    admin = new Pool({ connectionString: process.env.POSTGRES_ADMIN_URL });
    await admin.query(`CREATE DATABASE "${targetName}"`);
    const targetUrl = new URL(process.env.POSTGRES_ADMIN_URL);
    targetUrl.pathname = `/${targetName}`;
    process.env.RESTORE_TARGET_DATABASE_URL = targetUrl.toString();
    target = new Pool({ connectionString: targetUrl.toString() });
  });

  afterAll(async () => {
    await target?.end();
    if (admin && targetName) {
      await admin.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1", [targetName]);
      await admin.query(`DROP DATABASE IF EXISTS "${targetName}"`);
      await admin.end();
    }
    if (backupDirectory) await rm(backupDirectory, { recursive: true, force: true });
  });

  it("runs a native restore drill, relationship comparison, and zero-difference reconciliation", async () => {
    const failingDump = path.join(backupDirectory, "pg_dump_fail");
    await writeFile(failingDump, "#!/bin/sh\nexit 7\n", { mode: 0o700 });
    process.env.PG_DUMP_BIN = failingDump;
    await expect(createSystemBackup({ userId: "restore_drill", userName: "Restore Drill" }, "Expected failure")).rejects.toMatchObject({ code: "BACKUP_CREATE_FAILED" });
    delete process.env.PG_DUMP_BIN;

    const suffix = Date.now().toString().slice(-7);
    const customer = await createStudioCustomer({ name: "Restore Drill Customer", mobile: `0911${suffix}` });
    const person = await createStudioPersonnel({ fullName: "Restore Drill Crew", mobile: `0921${suffix}`, primaryRole: "photographer", personnelType: "temporary_worker" });
    const [account] = await db.insert(accounts).values({ code: `DRILL-${randomUUID()}`, name: "Restore Drill Bank", type: "bank", balance: "500000000", status: "active" }).returning();
    const project = await createStudioProject({ studioCustomerId: customer.id, title: "Restore Drill Project", eventDate: new Date("2027-02-01T08:00:00Z") });
    const contract = await createStudioContract(project.id, { totalAmount: 100000000, depositAmount: 30000000, idempotencyKey: `contract-${randomUUID()}` });
    const receipt = await createStudioPayment(project.id, { amount: 30000000, accountId: account.id, idempotencyKey: `receipt-${randomUUID()}` });
    const expense = await createStudioExpense(project.id, { title: "Other cost", amount: 5000000, accountId: account.id, idempotencyKey: `expense-${randomUUID()}` });
    const rental = await addRentalToProject(project.id, { itemTitle: "Rental camera", rentalCost: 10000000, pickupDate: "2027-02-01", returnDate: "2027-02-02", accountId: account.id, idempotencyKey: `rental-${randomUUID()}` });
    const wage = await assignPersonnelToProject(project.id, { personnelId: person.id, rateAmount: 20000000 });
    await updatePersonnelSalaryStatus(wage.id, "paid", "2027-02-03", { accountId: account.id, idempotencyKey: `wage-${randomUUID()}` });
    const equipment = await createStudioEquipment({ title: "Restore Drill Camera", category: "camera" });
    const reservation = await reserveStudioEquipment({ equipmentId: equipment.id, studioProjectId: project.id, assignedPersonnelId: person.id, reservedFrom: "2027-02-01T08:00:00Z", reservedTo: "2027-02-01T16:00:00Z" });
    const [plan] = await db.update(studioProductionPlans).set({ targetDeliveryDate: new Date("2027-02-20T08:00:00Z") }).where(eq(studioProductionPlans.studioProjectId, project.id)).returning();
    const [step] = await db.insert(studioProductionSteps).values({ planId: plan.id, assignedPersonnelId: person.id, stepName: "Delivery", deadline: new Date("2027-02-19T08:00:00Z"), status: "completed" }).returning();
    const [calendar] = await db.insert(studioCalendarEvents).values({ studioProjectId: project.id, title: "Restore Drill Shoot", startTime: new Date("2027-02-01T08:00:00Z"), endTime: new Date("2027-02-01T16:00:00Z"), assignedPersonnelIds: [person.id], status: "completed" }).returning();
    const details = await getStudioProjectById(project.id);
    expect(details.financialSummary).toMatchObject({ invoicedRevenue: 100000000, collectedRevenue: 30000000, totalCost: 35000000, grossProfit: 65000000, outstandingReceivable: 70000000 });

    const coreProjectId = project.projectId;
    const invoiceId = contract.invoiceId;
    const paymentId = receipt.paymentId;
    const expenseId = expense.expenseId;
    if (!coreProjectId || !invoiceId || !paymentId || !expenseId) throw new Error("Canonical financial links were not created.");
    const ids = { coreProject: coreProjectId, customer: customer.customerId, studioCustomer: customer.id, studioProject: project.id, contract: contract.id, invoice: invoiceId, studioPayment: receipt.id, payment: paymentId, studioExpense: expense.id, expense: expenseId, rental: rental.id, person: person.id, wage: wage.id, equipment: equipment.id, reservation: reservation.id, plan: plan.id, step: step.id, calendar: calendar.id, account: account.id };
    const sourceSnapshot = await snapshot(pool, ids);
    const sourceFinancial = await financialSnapshot(pool, coreProjectId, account.id);
    expect(sourceFinancial).toEqual({ invoiced: 100000000, collected: 30000000, cost: 35000000, grossProfit: 65000000, outstanding: 70000000, accountBalance: 495000000 });

    const backup = await createSystemBackup({ userId: "restore_drill", userName: "Restore Drill" }, "Automated isolated restore drill");
    expect(await validateRestore(backup.id)).toMatchObject({ backupValid: true, checksumValid: true, readable: true, formatSupported: true, metadataValid: true });

    const failingRestore = path.join(backupDirectory, "pg_restore_fail");
    await writeFile(failingRestore, "#!/bin/sh\n[ \"$1\" = \"--list\" ] && exit 0\nexit 9\n", { mode: 0o700 });
    process.env.PG_RESTORE_BIN = failingRestore;
    await expect(restoreBackupToIsolatedDatabase(backup.id, "RESTORE", { userId: "restore_drill", userName: "Restore Drill" })).rejects.toThrow();
    expect(Number((await target.query("SELECT COUNT(*)::int AS count FROM pg_catalog.pg_tables WHERE schemaname='public'")).rows[0].count)).toBe(0);
    delete process.env.PG_RESTORE_BIN;
    expect(Number((await pool.query("SELECT COUNT(*)::int AS count FROM audit_logs WHERE action='RESTORE_FAILED' AND entity_id=$1", [backup.id])).rows[0].count)).toBeGreaterThanOrEqual(1);

    const restored = await restoreBackupToIsolatedDatabase(backup.id, "RESTORE", { userId: "restore_drill", userName: "Restore Drill" });
    expect(restored).toMatchObject({ restored: true, targetVerified: true, switched: false, integrity: { valid: true } });
    expect((await target.query("SELECT 1 AS ready")).rows[0].ready).toBe(1);
    const restoredSnapshot = await snapshot(target, ids);
    expect(restoredSnapshot).toEqual(sourceSnapshot);
    expect(restoredSnapshot.timeline.count).toBeGreaterThanOrEqual(1);
    expect(restoredSnapshot.audit.count).toBeGreaterThanOrEqual(3);
    expect(restoredSnapshot.migrations).toEqual(requiredMigrationIds);

    const restoredFinancial = await financialSnapshot(target, coreProjectId, account.id);
    expect(restoredFinancial).toEqual(sourceFinancial);
    expect(restoredFinancial.grossProfit).toBe(65000000);

    await expect(restoreBackupToIsolatedDatabase(backup.id, "RESTORE", { userId: "restore_drill", userName: "Restore Drill" })).rejects.toMatchObject({ code: "RESTORE_TARGET_NOT_EMPTY" });

    await target.query("BEGIN");
    await target.query("DELETE FROM app_migrations WHERE id=$1", [requiredMigrationIds.at(-1)]);
    const applied = (await target.query("SELECT id FROM app_migrations")).rows.map((row) => row.id);
    expect(missingRequiredMigrations(applied)).toEqual([requiredMigrationIds.at(-1)]);
    await target.query("ROLLBACK");

    const storage = getBackupStorage();
    const metadataPath = path.join(backupDirectory, `${backup.id}.json`);
    const originalMetadata = await readFile(metadataPath, "utf8");
    await writeFile(metadataPath, JSON.stringify({ formatVersion: 999 }), { mode: 0o600 });
    expect(await validateRestore(backup.id)).toMatchObject({ backupValid: false, metadataValid: false });
    await writeFile(metadataPath, originalMetadata, { mode: 0o600 });
    const archive = await storage.resolve(backup.id);
    const bytes = await readFile(archive);
    bytes[Math.max(0, bytes.length - 16)] ^= 0xff;
    await writeFile(archive, bytes, { mode: 0o600 });
    expect(await validateRestore(backup.id)).toMatchObject({ backupValid: false, checksumValid: false });
    await expect(restoreBackupToIsolatedDatabase(backup.id, "RESTORE", { userId: "restore_drill", userName: "Restore Drill" })).rejects.toMatchObject({ code: "RESTORE_VALIDATION_FAILED" });
  }, 180000);
});
