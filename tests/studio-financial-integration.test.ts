import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/db";
import { migrateDatabase } from "../src/db/migrate";
import { accounts, auditLogs, equipmentReservations, expenses, invoices, paymentAllocations, payments, personnelSalaryRecords, projects, rentalEquipment, studioCalendarEvents, studioContracts, studioProductionPlans, studioProductionSteps, studioProjectExpenses, studioProjectPayments, studioProjects } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { createStudioCustomer } from "../src/services/studio/customerService";
import { createStudioPersonnel, deletePersonnelSalaryRecord, updatePersonnelSalaryStatus } from "../src/services/studio/personnelService";
import { deleteRentalEquipment } from "../src/services/studio/equipmentService";
import { createStudioEquipment, reserveStudioEquipment } from "../src/services/studio/equipmentService";
import { addRentalToProject, assignPersonnelToProject, createStudioContract, createStudioExpense, createStudioPayment, createStudioProject, deleteStudioExpense, deleteStudioPayment, getStudioProjectById, updateStudioProjectStage } from "../src/services/studio/projectService";
import { getStudioReconciliationReport } from "../src/services/studio/reconciliation";

describe("Studio canonical financial integration", () => {
  beforeAll(migrateDatabase);

  it("posts one idempotent end-to-end project flow to ERP accounting", async () => {
    const suffix = Date.now().toString().slice(-7);
    const customer = await createStudioCustomer({ name: "مشتری یکپارچه", mobile: `0912${suffix}` });
    const personnel = await createStudioPersonnel({ fullName: "عامل تست مالی", mobile: `0935${suffix}`, primaryRole: "photographer", personnelType: "temporary_worker" });
    const [account] = await db.insert(accounts).values({ code: `BANK-${randomUUID()}`, name: "حساب تست یکپارچگی", type: "bank", balance: "500000000", status: "active" }).returning();
    const studioProject = await createStudioProject({ studioCustomerId: customer.id, title: "پروژه یکپارچگی مالی", eventDate: new Date("2026-10-01T10:00:00Z") });
    expect(studioProject.projectId).toBeTruthy();
    expect(await db.select().from(projects).where(eq(projects.id, studioProject.projectId!))).toHaveLength(1);

    const contractKey = `contract-${randomUUID()}`;
    const contract = await createStudioContract(studioProject.id, { totalAmount: 100000000, depositAmount: 30000000, idempotencyKey: contractKey });
    const repeatedContract = await createStudioContract(studioProject.id, { totalAmount: 100000000, depositAmount: 30000000, idempotencyKey: contractKey });
    expect(repeatedContract.id).toBe(contract.id);
    expect(contract.invoiceId).toBeTruthy();

    const receiptKey = `receipt-${randomUUID()}`;
    const receipt = await createStudioPayment(studioProject.id, { amount: 30000000, accountId: account.id, idempotencyKey: receiptKey });
    expect((await createStudioPayment(studioProject.id, { amount: 30000000, accountId: account.id, idempotencyKey: receiptKey })).id).toBe(receipt.id);
    expect(receipt.paymentId).toBeTruthy();

    const expenseKey = `expense-${randomUUID()}`;
    const directExpense = await createStudioExpense(studioProject.id, { title: "چاپ آلبوم", expenseCategory: "printing_album", amount: 5000000, accountId: account.id, idempotencyKey: expenseKey });
    expect((await createStudioExpense(studioProject.id, { title: "چاپ آلبوم", expenseCategory: "printing_album", amount: 5000000, accountId: account.id, idempotencyKey: expenseKey })).id).toBe(directExpense.id);

    const rentalKey = `rental-${randomUUID()}`;
    const rental = await addRentalToProject(studioProject.id, { itemTitle: "لنز رنتال", rentalCost: 10000000, pickupDate: "2026-10-01", returnDate: "2026-10-02", accountId: account.id, idempotencyKey: rentalKey });
    expect((await addRentalToProject(studioProject.id, { itemTitle: "لنز رنتال", rentalCost: 10000000, pickupDate: "2026-10-01", returnDate: "2026-10-02", accountId: account.id, idempotencyKey: rentalKey })).id).toBe(rental.id);
    expect(rental.expenseId).toBeTruthy();

    const equipment = await createStudioEquipment({ title: "دوربین E2E", category: "camera" });
    const reservation = await reserveStudioEquipment({ equipmentId: equipment.id, studioProjectId: studioProject.id, assignedPersonnelId: personnel.id, reservedFrom: "2026-10-01T08:00:00Z", reservedTo: "2026-10-01T18:00:00Z" });
    const [plan] = await db.update(studioProductionPlans).set({ targetDeliveryDate: new Date("2026-10-20T10:00:00Z"), currentStage: "selection" }).where(eq(studioProductionPlans.studioProjectId, studioProject.id)).returning();
    await db.insert(studioProductionSteps).values({ planId: plan.id, stepName: "انتخاب و ادیت", assignedPersonnelId: personnel.id, status: "completed", completedAt: new Date("2026-10-05T10:00:00Z") });
    await db.insert(studioCalendarEvents).values({ studioProjectId: studioProject.id, title: "اجرای پروژه E2E", startTime: new Date("2026-10-01T08:00:00Z"), endTime: new Date("2026-10-01T18:00:00Z"), assignedPersonnelIds: [personnel.id], status: "completed" });

    const wage = await assignPersonnelToProject(studioProject.id, { personnelId: personnel.id, rateAmount: 20000000 });
    const wageKey = `wage-${randomUUID()}`;
    const paidWage = await updatePersonnelSalaryStatus(wage.id, "paid", "2026-10-03", { accountId: account.id, idempotencyKey: wageKey, actorName: "Integration Test" });
    expect((await updatePersonnelSalaryStatus(wage.id, "paid", "2026-10-03", { accountId: account.id, idempotencyKey: wageKey })).paymentId).toBe(paidWage.paymentId);
    await updateStudioProjectStage(studioProject.id, "completed", "E2E delivery completed", "Integration Test");

    const refreshed = (await db.select().from(accounts).where(eq(accounts.id, account.id)))[0];
    expect(Number(refreshed.balance)).toBe(495000000);
    expect(await db.select().from(invoices).where(eq(invoices.projectId, studioProject.projectId!))).toHaveLength(1);
    expect(await db.select().from(payments).where(eq(payments.projectId, studioProject.projectId!))).toHaveLength(4);
    expect(await db.select().from(expenses).where(eq(expenses.projectId, studioProject.projectId!))).toHaveLength(3);
    expect((await db.select().from(studioContracts).where(eq(studioContracts.id, contract.id)))[0].invoiceId).toBeTruthy();
    expect((await db.select().from(studioProjectPayments).where(eq(studioProjectPayments.id, receipt.id)))[0].paymentId).toBeTruthy();
    expect((await db.select().from(studioProjectExpenses).where(eq(studioProjectExpenses.id, directExpense.id)))[0].expenseId).toBeTruthy();
    expect((await db.select().from(personnelSalaryRecords).where(eq(personnelSalaryRecords.id, wage.id)))[0].paymentId).toBeTruthy();
    expect(await db.select().from(paymentAllocations).where(eq(paymentAllocations.paymentId, receipt.paymentId!))).toHaveLength(1);
    expect(await db.select().from(equipmentReservations).where(eq(equipmentReservations.id, reservation.id))).toHaveLength(1);
    expect(await db.select().from(studioProductionPlans).where(eq(studioProductionPlans.id, plan.id))).toHaveLength(1);
    expect((await db.select().from(auditLogs).where(eq(auditLogs.entityId, receipt.id))).length).toBeGreaterThan(0);

    const summary = (await getStudioProjectById(studioProject.id)).financialSummary;
    expect(summary).toMatchObject({ source: "erp", invoicedRevenue: 100000000, recognizedRevenue: 100000000, revenueRecognitionBasis: "issued_invoices", collectedRevenue: 30000000, personnelCostTotal: 20000000, rentalCostTotal: 10000000, directExpensesTotal: 5000000, totalCost: 35000000, grossProfit: 65000000, outstandingReceivable: 70000000 });
    const reconciliation = await getStudioReconciliationReport([studioProject.projectId!]);
    expect(reconciliation).toMatchObject({ mode: "dry-run", readOnly: true, total: 0 });
  });

  it("rolls back all writes when an expense payment violates account balance", async () => {
    const [project] = await db.select().from(studioProjects).where(eq(studioProjects.title, "پروژه یکپارچگی مالی")).limit(1);
    const before = await db.select().from(studioProjectExpenses).where(eq(studioProjectExpenses.studioProjectId, project.id));
    await expect(createStudioExpense(project.id, { title: "هزینه نامعتبر", amount: 999999999999, accountId: (await db.select().from(accounts).where(eq(accounts.name, "حساب تست یکپارچگی")))[0].id, idempotencyKey: `rollback-${randomUUID()}` })).rejects.toThrow("موجودی حساب");
    const after = await db.select().from(studioProjectExpenses).where(eq(studioProjectExpenses.studioProjectId, project.id));
    expect(after).toHaveLength(before.length);
  });

  it("rolls back financial posting when its authoritative audit actor is invalid", async () => {
    const [project] = await db.select().from(studioProjects).where(eq(studioProjects.title, "پروژه یکپارچگی مالی")).limit(1);
    const [account] = await db.select().from(accounts).where(eq(accounts.name, "حساب تست یکپارچگی")).limit(1);
    const beforeExpenses = await db.select().from(expenses).where(eq(expenses.projectId, project.projectId!));
    const beforePayments = await db.select().from(payments).where(eq(payments.projectId, project.projectId!));
    const beforeBalance = Number(account.balance);
    await expect(createStudioExpense(project.id, { title: "Audit rollback", amount: 1000, accountId: account.id, idempotencyKey: `audit-failure-${randomUUID()}`, actorId: randomUUID() })).rejects.toThrow();
    expect(await db.select().from(expenses).where(eq(expenses.projectId, project.projectId!))).toHaveLength(beforeExpenses.length);
    expect(await db.select().from(payments).where(eq(payments.projectId, project.projectId!))).toHaveLength(beforePayments.length);
    expect(Number((await db.select().from(accounts).where(eq(accounts.id, account.id)))[0].balance)).toBe(beforeBalance);
  });

  it("refuses to hard-delete posted Studio financial records", async () => {
    const [project] = await db.select().from(studioProjects).where(eq(studioProjects.title, "پروژه یکپارچگی مالی")).limit(1);
    const [receipt] = await db.select().from(studioProjectPayments).where(eq(studioProjectPayments.studioProjectId, project.id)).limit(1);
    const [directExpense] = await db.select().from(studioProjectExpenses).where(eq(studioProjectExpenses.studioProjectId, project.id)).limit(1);
    const [wage] = await db.select().from(personnelSalaryRecords).where(eq(personnelSalaryRecords.studioProjectId, project.id)).limit(1);
    const [rental] = await db.select().from(rentalEquipment).where(eq(rentalEquipment.studioProjectId, project.id)).limit(1);
    await expect(deleteStudioPayment(receipt.id)).rejects.toThrow("قابل حذف نیست");
    await expect(deleteStudioExpense(directExpense.id)).rejects.toThrow("قابل حذف نیست");
    await expect(deletePersonnelSalaryRecord(wage.id)).rejects.toThrow("قابل حذف نیست");
    await expect(deleteRentalEquipment(rental.id)).rejects.toThrow("قابل حذف نیست");
  });
});
