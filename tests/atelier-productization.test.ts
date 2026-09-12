import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/db";
import { migrateDatabase } from "../src/db/migrate";
import { accounts, customers, employees, studioCalendarEvents, studioContracts, studioDeliverables, studioInstallmentAllocations, studioInstallments, studioPersonnel, studioProductionPlans, studioTasks, studioWorkflowTemplates, studioProjects } from "../src/db/schema";
import { eq } from "drizzle-orm";
import type { EmployeeContext } from "../src/services/access";
import { saveCatalog } from "../src/services/studio/catalog";
import { convertLead, listLeads, ownedLead, saveLead, scheduleLeadConsultation } from "../src/services/studio/leads";
import { createStudioContract, createStudioPayment, getStudioProjectById } from "../src/services/studio/projectService";
import { saveDeliverable, saveTask } from "../src/services/studio/operations";
import { createStudioPersonnel } from "../src/services/studio/personnelService";
import { getStudioDashboard } from "../src/services/studio/dashboard";
import { getAtelierReports } from "../src/services/studio/reports";

const actorId = "b1000000-0000-4000-8000-000000000001";
const actor: EmployeeContext = { employeeId: actorId, employeeName: "مدیر محصول آتلیه", permissions: new Set(["*"]) };
describe("Atelier product domains", () => {
  beforeAll(async () => {
    await migrateDatabase();
    await db.insert(employees).values({ id: actorId, code: "ATELIER-OWNER", name: actor.employeeName, mobile: "09000000009", status: "active" }).onConflictDoNothing();
  });

  it("converts a lead idempotently without duplicate client or project", async () => {
    const mobile = `0912${Date.now().toString().slice(-7)}`;
    const lead = await saveLead(actor, { name: "مشتری سفر کامل", mobile, eventType: "wedding", desiredDate: "2027-02-12", stage: "booked", nextFollowUp: "2027-01-10" });
    const first = await convertLead(actor, lead.id);
    const second = await convertLead(actor, lead.id);
    expect(second).toEqual({ projectId: first.projectId, reused: true });
    expect(await db.select().from(customers).where(eq(customers.mobile, mobile))).toHaveLength(1);
    expect(await db.select().from(studioProjects).where(eq(studioProjects.id, first.projectId))).toHaveLength(1);
    const tasks = await db.select().from(studioTasks).where(eq(studioTasks.studioProjectId, first.projectId));
    expect(tasks.some(task => task.stage === "raw_backup")).toBe(true);
    expect(tasks.some(task => task.stage === "video_edit")).toBe(true);
  });

  it("keeps one Team profile linked to an optional organizational account", async () => {
    const profile = await createStudioPersonnel({ employeeId: actorId, personnelType: "temporary_worker", fullName: "همکار آزاد تست", mobile: "09120000098", primaryRole: "عکاس", experienceYears: 7, skills: [{ skillTitle: "عکاسی", skillCategory: "shooting", proficiencyLevel: "senior" }] });
    expect(profile).toMatchObject({ employeeId: actorId, personnelType: "temporary_worker", experienceYears: 7 });
    await expect(createStudioPersonnel({ employeeId: actorId, personnelType: "employee", fullName: "پروفایل تکراری", mobile: "09120000097", primaryRole: "عکاس" })).rejects.toThrow("قبلاً");
    expect(await db.select().from(studioPersonnel).where(eq(studioPersonnel.employeeId, actorId))).toHaveLength(1);
  });

  it("books one idempotent consultation owned by the assigned employee", async () => {
    const lead = await saveLead(actor, { name: "مشتری مشاوره", mobile: "09120000096", eventType: "wedding", nextFollowUp: "2027-01-12T10:00:00Z" });
    const first = await scheduleLeadConsultation(actor, lead.id);
    const second = await scheduleLeadConsultation(actor, lead.id);
    expect(second.id).toBe(first.id);
    expect(first.ownerEmployeeId).toBe(actorId);
    expect(await db.select().from(studioCalendarEvents).where(eq(studioCalendarEvents.id, first.id))).toHaveLength(1);
  });

  it("prevents cross-owner lead access while admin wildcard remains unscoped", async () => {
    const otherId = randomUUID();
    await db.insert(employees).values({ id: otherId, code: `OTHER-${Date.now()}`, name: "کارشناس دیگر", mobile: "09120000095", status: "active" });
    const other: EmployeeContext = { employeeId: otherId, employeeName: "کارشناس دیگر", permissions: new Set(["studio.crm.manage"]) };
    const privateLead = await saveLead(other, { name: "سرنخ خصوصی", mobile: "09120000094", eventType: "portrait" });
    await expect(ownedLead({ ...actor, permissions: new Set(["studio.crm.manage"]) }, privateLead.id)).rejects.toThrow("یافت نشد");
    expect((await listLeads(actor)).some(row => row.id === privateLead.id)).toBe(true);
  });

  it("uses different workflow snapshots for portrait projects", async () => {
    const mobile = `0935${Date.now().toString().slice(-7)}`;
    const lead = await saveLead(actor, { name: "مشتری پرتره", mobile, eventType: "portrait", desiredDate: "2027-03-12", stage: "booked" });
    const converted = await convertLead(actor, lead.id);
    const [plan] = await db.select().from(studioProductionPlans).where(eq(studioProductionPlans.studioProjectId, converted.projectId));
    const snapshot = plan.workflowSnapshot as Array<{ stage: string }>;
    expect(snapshot.some(stage => stage.stage === "video_edit")).toBe(false);
    expect(snapshot.some(stage => stage.stage === "album_print")).toBe(false);
    const tasks = await db.select().from(studioTasks).where(eq(studioTasks.studioProjectId, converted.projectId));
    for (const task of tasks.sort((a, b) => a.position - b.position)) await saveTask(actor, converted.projectId, { ...task, dueDate: task.dueDate?.toISOString(), status: "done" }, task.id);
    const [completed] = await db.select().from(studioProjects).where(eq(studioProjects.id, converted.projectId));
    expect(completed.status).toBe("delivered");
  });

  it("freezes package and add-on pricing in the canonical contract", async () => {
    const workflow = (await db.select().from(studioWorkflowTemplates).where(eq(studioWorkflowTemplates.jobType, "wedding")))[0];
    const pack = await saveCatalog(actor, { kind: "package", name: "پکیج تست عروسی", jobType: "wedding", basePrice: 100_000_000, workflowTemplateId: workflow.id, specifications: { photographers: 2, hours: 8 } });
    const addon = await saveCatalog(actor, { kind: "addon", name: "هلی‌شات", jobType: "wedding", basePrice: 10_000_000, parentId: pack.id, specifications: { duration: 60 } });
    const lead = await saveLead(actor, { name: "مشتری پکیج", mobile: `0991${Date.now().toString().slice(-7)}`, eventType: "wedding", desiredDate: "2027-04-12", stage: "booked", catalogItemId: pack.id });
    const project = await convertLead(actor, lead.id);
    const contract = await createStudioContract(project.projectId, { packageId: pack.id, addons: [{ id: addon.id, quantity: 2 }], discount: 5_000_000, depositAmount: 15_000_000, installmentsCount: 3, idempotencyKey: randomUUID() });
    expect(Number(contract.totalAmount)).toBe(115_000_000);
    expect((contract.packageSnapshot as any).items).toHaveLength(2);
    await saveCatalog(actor, { ...pack, basePrice: 200_000_000 }, pack.id);
    const [stored] = await db.select().from(studioContracts).where(eq(studioContracts.id, contract.id));
    expect((stored.packageSnapshot as any).total).toBe(115_000_000);
    const installments = await db.select().from(studioInstallments).where(eq(studioInstallments.contractId, contract.id));
    expect(installments).toHaveLength(3);
    expect(installments.reduce((sum, row) => sum + Number(row.amount), 0)).toBe(100_000_000);

    const accountId = randomUUID();
    await db.insert(accounts).values({ id: accountId, code: `AT-${Date.now()}`, name: "حساب تست اقساط", type: "bank", balance: "0", status: "active" });
    const payment = await createStudioPayment(project.projectId, { accountId, amount: 40_000_000, paymentType: "installment_1", idempotencyKey: randomUUID(), actorId, authorName: actor.employeeName });
    const allocations = await db.select().from(studioInstallmentAllocations).where(eq(studioInstallmentAllocations.studioPaymentId, payment.id));
    expect(allocations.reduce((sum, row) => sum + Number(row.amount), 0)).toBe(40_000_000);
    const refreshed = await getStudioProjectById(project.projectId);
    expect(refreshed.installments.map(row => row.status)).toEqual(["paid", "partial", "pending"]);
    const dashboard = await getStudioDashboard(null, true, actorId, true);
    const reports = await getAtelierReports(null, actorId, true);
    expect(dashboard.finance).toMatchObject({ contracted: 115_000_000, collected: 40_000_000, outstanding: 75_000_000 });
    expect(reports.finance).toMatchObject({ contracted: 115_000_000, collected: 40_000_000, outstanding: 75_000_000 });
    const redacted = await getAtelierReports(null, actorId, true, { finance: false, wages: false });
    expect(redacted.finance).toBeNull();
    expect(redacted.personnel.every(row => row.wages === null && row.outstanding === null)).toBe(true);
  });

  it("enforces workflow dependency and records safe delivery links", async () => {
    const [project] = await db.select().from(studioProjects).limit(1);
    const first = await saveTask(actor, project.id, { title: "کار پایه", stage: "post_production", priority: "high", status: "open" });
    const blocked = await saveTask(actor, project.id, { title: "کار وابسته", stage: "delivery", priority: "urgent", status: "open", dependencyId: first.id });
    await expect(saveTask(actor, project.id, { ...blocked, status: "done" }, blocked.id)).rejects.toThrow("وابسته");
    await saveTask(actor, project.id, { ...first, status: "done" }, first.id);
    await expect(saveTask(actor, project.id, { ...blocked, status: "done" }, blocked.id)).resolves.toMatchObject({ status: "done" });
    await expect(saveTask(actor, project.id, { ...first, dependencyId: blocked.id }, first.id)).rejects.toThrow("چرخه");
    await expect(saveDeliverable(actor, project.id, { kind: "gallery", title: "گالری", url: "ftp://invalid.test" })).rejects.toThrow("HTTP");
    const delivered = await saveDeliverable(actor, project.id, { kind: "gallery", title: "گالری", url: "https://gallery.example.test/job", status: "confirmed" });
    expect(delivered.confirmedAt).toBeInstanceOf(Date);
    expect(await db.select().from(studioDeliverables).where(eq(studioDeliverables.id, delivered.id))).toHaveLength(1);
  });
});
