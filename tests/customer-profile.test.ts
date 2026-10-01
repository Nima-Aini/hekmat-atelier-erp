import { beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
const state = vi.hoisted(() => ({ unauthenticated: false, actorId: "dc000000-0000-4000-8000-000000000001", permissions: ["*"] as string[] }));
vi.mock("@/services/access", async () => {
  const { ApiError } = await import("../src/lib/apiError");
  return {
    requireAnyPermission: vi.fn(async () => { if (state.unauthenticated) throw new ApiError(401, "ابتدا وارد شوید"); return { employeeId: state.actorId, employeeName: "تست پرونده", permissions: new Set(state.permissions) }; }),
    canAccessPermission: vi.fn(async () => true),
  };
});
import { db } from "../src/db";
import { migrateDatabase } from "../src/db/migrate";
import {
  accounts, customers, employees, employeeProjectAssignments, invoices, payments, paymentAllocations,
  studioCalendarEvents, studioContractItems, studioDailyVisits, studioDailyVisitPersonnel, studioDeliverables,
  studioEquipment, equipmentReservations, studioInstallmentAllocations, studioPersonnel, studioPlanningPersonnel,
  studioProjectPayments, studioProjectTimelines, studioProjectTypes, studioProductionPlans, studioProductionSteps, studioReservations, studioTasks,
} from "../src/db/schema";
import { createPendingContract, approveContract } from "../src/services/studio/finalWorkflow";
import { saveContractInstallments, payAtelierInstallment } from "../src/services/studio/financeCenter";
import { postCanonicalReceipt } from "../src/services/financial";
import { getAtelierCustomerProfile } from "../src/services/studio/customerProfile";
import { atelierInstallmentState } from "../src/lib/atelierInstallment";
import { GET } from "../src/app/api/atelier/customers/[id]/route";
import type { EmployeeContext } from "../src/services/access";

const admin: EmployeeContext = { employeeId: state.actorId, employeeName: "تست پرونده", permissions: new Set(["*"]) };
const limitedId = "dc000000-0000-4000-8000-000000000002";
describe("Customer complete profile on a disposable database", () => {
  let a: Awaited<ReturnType<typeof createPendingContract>>, b: typeof a, other: typeof a;
  let installmentId: string, accountId: string, baseId: string, studioId: string;
  beforeAll(async () => {
    await migrateDatabase();
    await db.insert(employees).values([{ id: admin.employeeId, code: randomUUID(), name: admin.employeeName, mobile: "09000000081" }, { id: limitedId, code: randomUUID(), name: "پرسنل محدود", mobile: "09000000082" }]);
    const [type] = await db.select().from(studioProjectTypes).limit(1);
    const create = (name: string, mobile: string, amount: number) => createPendingContract(admin, { customerName: name, mobile, projectTypeId: type.id, programDate: new Date("2035-01-01T10:00:00Z"), items: [{ title: "خدمت واقعی تست", unitPrice: amount }], idempotencyKey: randomUUID() });
    a = await approveContract(admin, (await create("مشتری پرونده", "09120000081", 1000)).id);
    b = await approveContract(admin, (await create("مشتری پرونده", "09120000081", 2000)).id);
    other = await approveContract(admin, (await create("مشتری خارج از محدوده", "09120000083", 9999)).id);
    await create("مشتری پرونده", "09120000081", 8888); // Unapproved quote must not enter recognized debt.
    baseId = a.customer.id; studioId = a.customer.studioCustomerId;
    await db.update(customers).set({ email: "test@example.invalid", phone: "02100000000", address: "آدرس تست", creditLimit: "50000" }).where(eq(customers.id, baseId));
    const [account] = await db.insert(accounts).values({ code: randomUUID(), name: "حساب تست پرونده", type: "bank", balance: "0" }).returning(); accountId = account.id;
    const installments = await saveContractInstallments(admin, a.id, [{ title: "قسط گذشته", amount: 600, dueDate: "2020-01-01T00:00:00Z" }, { title: "قسط آینده", amount: 400, dueDate: "2035-01-01T00:00:00Z" }]);
    installmentId = installments[0].id;
    await payAtelierInstallment(admin, installmentId, { amount: 300, accountId, idempotencyKey: randomUUID(), paidAt: "2026-09-01T00:00:00Z" });
    const [corrected] = await db.insert(invoices).values({ invoiceNumber: randomUUID(), customerId: baseId, projectId: a.project.projectId, status: "corrected", grandTotal: "200", balanceDue: "200" }).returning();
    const receipt = await db.transaction(tx => postCanonicalReceipt(tx, { requestKey: randomUUID(), requestHash: "profile-test", customerId: baseId, invoiceId: corrected.id, projectId: a.project.projectId, accountId, amount: 50, paymentDate: new Date(), paymentMethod: "cash" }, { userId: admin.employeeId, employeeId: admin.employeeId, userName: admin.employeeName }));
    // A single real receipt split between two invoices: sums remain 350, never 400.
    await db.update(paymentAllocations).set({ allocatedAmount: "30" }).where(eq(paymentAllocations.paymentId, receipt.id));
    await db.insert(paymentAllocations).values({ paymentId: receipt.id, invoiceId: a.invoiceId!, allocatedAmount: "20" });
    // Legacy receipt linked by allocations only must still be included once.
    await db.update(payments).set({ customerId: null, invoiceId: null }).where(eq(payments.id, receipt.id));
    await db.update(invoices).set({ paidAmount: "320", balanceDue: "680" }).where(eq(invoices.id, a.invoiceId!));
    await db.update(invoices).set({ paidAmount: "30", balanceDue: "170" }).where(eq(invoices.id, corrected.id));
    await db.insert(invoices).values({ invoiceNumber: randomUUID(), customerId: baseId, projectId: a.project.projectId, status: "cancelled", grandTotal: "10000", balanceDue: "10000" });
    const [cancelled] = await db.insert(payments).values([{ paymentNumber: randomUUID(), customerId: baseId, projectId: a.project.projectId, invoiceId: a.invoiceId, accountId, amount: "9000", paymentType: "customer_receipt", status: "cancelled" }, { paymentNumber: randomUUID(), customerId: baseId, accountId, amount: "50", paymentType: "customer_receipt", status: "completed" }]).returning();
    const [mirror] = await db.insert(studioProjectPayments).values({ studioProjectId: a.project.id, paymentId: cancelled.id, invoiceId: a.invoiceId, amount: "100", financialStatus: "voided" }).returning();
    await db.insert(studioInstallmentAllocations).values({ installmentId, studioPaymentId: mirror.id, amount: "100" });
    const [person] = await db.insert(studioPersonnel).values({ fullName: "عکاس تست", mobile: "09120000084", primaryRole: "photographer" }).returning();
    const [item] = await db.select().from(studioContractItems).where(eq(studioContractItems.contractId, a.id));
    await db.insert(studioPlanningPersonnel).values({ contractItemId: item.id, personnelId: person.id, startsAt: new Date("2035-01-01T10:00:00Z"), endsAt: new Date("2035-01-01T12:00:00Z"), wageSnapshot: "7777" });
    const [gear] = await db.insert(studioEquipment).values({ code: randomUUID(), title: "دوربین تست", category: "camera" }).returning();
    await db.insert(equipmentReservations).values({ equipmentId: gear.id, studioProjectId: a.project.id, contractItemId: item.id, reservedFrom: new Date("2035-01-01T10:00:00Z"), reservedTo: new Date("2035-01-01T12:00:00Z") });
    await db.insert(studioCalendarEvents).values({ studioProjectId: a.project.id, title: "جلسه انتخاب", startTime: new Date("2035-01-02T10:00:00Z"), endTime: new Date("2035-01-02T11:00:00Z"), assignedPersonnelIds: [person.id] });
    await db.insert(studioTasks).values({ studioProjectId: a.project.id, title: "کار سررسیدگذشته", dueDate: new Date("2020-01-01"), assignedPersonnelId: person.id });
    const [plan] = await db.select().from(studioProductionPlans).where(eq(studioProductionPlans.studioProjectId, a.project.id));
    await db.insert(studioProductionSteps).values({ planId: plan.id, stepName: "مرحله انجام‌شده", deadline: new Date("2020-01-01"), status: "completed" });
    await db.insert(studioDeliverables).values({ studioProjectId: a.project.id, kind: "album", title: "تحویل آلبوم", dueDate: new Date("2035-01-03") });
    const [visit] = await db.insert(studioDailyVisits).values({ customerId: baseId, customerName: a.customer.name, mobile: "09120000081", title: "مراجعه تست", visitDate: new Date("2020-01-01"), price: "0" }).returning();
    await db.insert(studioDailyVisitPersonnel).values({ dailyVisitId: visit.id, personnelId: person.id, personnelNameSnapshot: "عکاس تاریخی", workTitle: "پرتره", wageSnapshot: "8888" });
    await db.insert(studioReservations).values({ customerName: a.customer.name, mobile: "09120000081", title: "رزرو قدیمی با شماره تماس", reservedAt: new Date("2035-01-03") });
    await db.insert(studioProjectTimelines).values({ studioProjectId: b.project.id, actionType: "PAYMENT_RECORDED", title: "دریافت محرمانه پروژه ب", description: "SECRET-HIDDEN-FINANCE", metadata: { amount: 99999 } });
    await db.insert(studioProjectTimelines).values({ studioProjectId: a.project.id, actionType: "PERSONNEL_ASSIGNED", title: "تخصیص عکاس", description: "SECRET-EMBEDDED-WAGE", metadata: { wageSnapshot: 7777 } });
    await db.insert(employeeProjectAssignments).values([{ employeeId: limitedId, projectId: a.project.projectId!, status: "active", permissionSet: {} }, { employeeId: limitedId, projectId: b.project.projectId!, status: "active", permissionSet: { "studio.finance.view": false, "studio.planning.view": false, "studio.calendar.view": false } }]);
  });
  it("uses canonical active invoices and completed receipts without counting drafts, cancelled records or mirrors twice", async () => {
    const profile = await getAtelierCustomerProfile(admin, studioId);
    expect(profile.financial!.summary).toMatchObject({ total: 3200, paid: 350, remaining: 2850, received: 400, unapplied: 50, remainingInstallments: 700, overdue: 300 });
    expect(profile.financial!.invoices.some(i => i.status === "cancelled" && !i.active)).toBe(true);
    expect(profile.financial!.receipts.find(r => r.allocations.length === 2)!.amount).toBe(50);
    expect(profile.financial!.installments.find(i => i.id === installmentId)).toMatchObject({ amount: 600, paidAmount: 300, remainingAmount: 300, status: "partial", isOverdue: true });
    expect(profile.financial!.installments.find(i => i.id === installmentId)!.payments).toHaveLength(1);
    expect(profile.customer).toMatchObject({ email: "test@example.invalid", phone: "02100000000", address: "آدرس تست" });
  });
  it("combines authoritative schedules without inferring customer links from matching phones", async () => {
    const profile = await getAtelierCustomerProfile(admin, studioId);
    for (const kind of ["خدمت قرارداد", "تقویم", "کار", "برنامه تولید", "مرحله تولید", "تحویل", "مراجعه روزانه"]) expect(profile.schedule.some(s => s.kind === kind)).toBe(true);
    expect(profile.schedule.some(s => s.kind === "رزرو با شماره تماس مشتری")).toBe(false);
    const item = profile.schedule.find(s => s.kind === "خدمت قرارداد")!;
    expect(item.personnel[0].name).toBe("عکاس تست"); expect(item.equipment[0]).toContain("دوربین تست");
    expect(profile.schedule.find(s => s.title === "کار سررسیدگذشته")!.overdue).toBe(true);
    expect(profile.schedule.find(s => s.title === "مرحله انجام‌شده")!.overdue).toBe(false);
    expect(JSON.stringify(profile.schedule)).not.toContain("wageSnapshot");
    expect(JSON.stringify(profile.history)).not.toContain("metadata");
  });
  it("independently enforces project overrides for finance/planning and never leaks hidden project money/history", async () => {
    const limited: EmployeeContext = { employeeId: limitedId, employeeName: "محدود", permissions: new Set(["studio.customers.view", "studio.contract.view", "studio.planning.view", "studio.calendar.view", "studio.finance.view"]) };
    const profile = await getAtelierCustomerProfile(limited, studioId);
    expect(profile.financial!.summary).toMatchObject({ total: 1200, paid: 350, remaining: 850 });
    expect(profile.projects.find(p => p.id === b.project.id)!.contracts[0]).toMatchObject({ amount: null, paid: null, remaining: null });
    expect(JSON.stringify(profile)).not.toContain("SECRET-HIDDEN-FINANCE");
    const forbiddenItems = await db.select().from(studioContractItems).where(eq(studioContractItems.contractId, b.id));
    expect(profile.schedule.every(s => !forbiddenItems.some(item => s.id === `item:${item.id}`))).toBe(true);
    await expect(getAtelierCustomerProfile(limited, other.customer.studioCustomerId)).rejects.toMatchObject({ status: 403 });
    const customerOnly = await getAtelierCustomerProfile({ ...limited, permissions: new Set(["studio.customers.view"]) }, studioId);
    expect(customerOnly.financial).toBeNull(); expect(customerOnly.schedule).toHaveLength(0);
    expect(customerOnly.customer.creditLimit).toBeNull(); expect(customerOnly.customer.paymentTermsDays).toBeNull();
    expect(customerOnly.projects.every(p => p.contracts.length === 0)).toBe(true);
    const planningOnly = await getAtelierCustomerProfile({ ...limited, permissions: new Set(["studio.customers.view", "studio.planning.view"]) }, studioId);
    expect(planningOnly.history.find(h => h.title === "تخصیص عکاس")!.description).toBeNull();
    expect(JSON.stringify(planningOnly)).not.toContain("SECRET-EMBEDDED-WAGE");
  });
  it("blocks unauthenticated, malformed and not-found direct API access; successful responses are private/no-store", async () => {
    state.unauthenticated = true;
    expect((await GET(new Request("http://localhost"), { params: Promise.resolve({ id: studioId }) })).status).toBe(401);
    state.unauthenticated = false;
    state.actorId = limitedId; state.permissions = ["studio.customers.view"];
    expect((await GET(new Request("http://localhost"), { params: Promise.resolve({ id: other.customer.studioCustomerId }) })).status).toBe(403);
    state.actorId = admin.employeeId; state.permissions = ["*"];
    expect((await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "bad-id" }) })).status).toBe(400);
    expect((await GET(new Request("http://localhost"), { params: Promise.resolve({ id: randomUUID() }) })).status).toBe(404);
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: studioId }) });
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("refreshes from existing source records without posting money or mutating data", async () => {
    const before = await db.select().from(invoices).where(eq(invoices.customerId, baseId));
    const transactionSpy = vi.spyOn(db, "transaction");
    await getAtelierCustomerProfile(admin, studioId);
    expect(transactionSpy).toHaveBeenLastCalledWith(expect.any(Function), { isolationLevel: "repeatable read", accessMode: "read only" });
    transactionSpy.mockRestore();
    expect(await db.select().from(invoices).where(eq(invoices.customerId, baseId))).toEqual(before);
    await db.update(customers).set({ name: "نام تازه پرونده" }).where(eq(customers.id, baseId));
    expect((await getAtelierCustomerProfile(admin, studioId)).customer.name).toBe("نام تازه پرونده");
  });
  it("shares existing installment statuses, including paid, partial, overdue and due-soon", () => {
    const now = new Date("2026-09-27T00:00:00Z");
    expect(atelierInstallmentState(100, 100, "2020-01-01", now).status).toBe("paid");
    expect(atelierInstallmentState(100, 50, "2020-01-01", now)).toMatchObject({ status: "partial", isOverdue: true });
    expect(atelierInstallmentState(100, 0, "2020-01-01", now).status).toBe("overdue");
    expect(atelierInstallmentState(100, 0, "2026-09-30", now).status).toBe("due_soon");
  });
  it("removes only Dashboard project state/query/UI and preserves other project APIs/context", () => {
    const dashboard = readFileSync(new URL("../src/components/atelier/FinalDashboard.tsx", import.meta.url), "utf8");
    for (const removed of ["selectedProjectId", "onProjectChange", 'params.set("projectId"', "پروژه داشبورد"]) expect(dashboard).not.toContain(removed);
    expect(dashboard).toContain("DashboardRangeFilter");
    const page = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
    expect(page).toContain("AiAssistantView selectedProjectId={selectedProjectId}");
    expect(page).toContain("#customers/"); expect(page).toContain('"popstate"');
    const service = readFileSync(new URL("../src/services/studio/customerProfile.ts", import.meta.url), "utf8");
    for (const write of [".insert(", ".update(", ".delete("]) expect(service).not.toContain(write);
  });
});
