import { beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
const state = vi.hoisted(() => ({ actorId: "da000000-0000-4000-8000-000000000001", deniedProject: "", allowed: [] as string[] }));
vi.mock("@/services/access", async () => {
  const { ApiError } = await import("../src/lib/apiError");
  const actor = () => ({ employeeId: state.actorId, employeeName: "تست ممیزی", roleCode: "manager", permissions: new Set(["*"]) });
  return {
    requireAnyPermission: vi.fn(async () => actor()),
    requirePermission: vi.fn(async (_permission: string, projectId?: string) => { if (projectId && projectId === state.deniedProject) throw new ApiError(403, "دسترسی پروژه مجاز نیست"); return actor(); }),
    getScopedProjectIds: vi.fn(async () => state.allowed),
    canAccessPermission: vi.fn(async () => true),
  };
});
import { db } from "../src/db";
import { migrateDatabase } from "../src/db/migrate";
import { accounts, employees, expenses, payments, studioContracts, studioProjectTypes } from "../src/db/schema";
import { approveContract, createPendingContract, listContracts } from "../src/services/studio/finalWorkflow";
import { getFinalCalendar, getFinalDashboard } from "../src/services/studio/finalInsights";
import { getAtelierReports } from "../src/services/studio/reports";
import { getAtelierFinanceCenter } from "../src/services/studio/financeCenter";
import { parseDashboardRange } from "../src/lib/dashboardRange";
import { POST as createAccount, PUT as editAccount } from "../src/app/api/accounts/route";
import { GET as listPayments } from "../src/app/api/payments/route";
import { GET as listExpenses } from "../src/app/api/expenses/route";
import { GET as listInvoices } from "../src/app/api/invoices/route";
import { GET as readExpense, PUT as editExpense, DELETE as deleteExpense } from "../src/app/api/expenses/[id]/route";

const actor = { employeeId: state.actorId, employeeName: "تست ممیزی", permissions: new Set(["*"]) };
const jsonRequest = (url: string, method: string, body: unknown) => new Request(`http://localhost${url}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const range = parseDashboardRange("2025-09-23", "2025-09-24");
describe("Production audit regression on disposable database", () => {
  let a: Awaited<ReturnType<typeof createPendingContract>>, b: typeof a, accountId: string, expenseId: string;
  beforeAll(async () => {
    await migrateDatabase();
    await db.insert(employees).values({ id: actor.employeeId, code: `AUDIT-${randomUUID()}`, name: actor.employeeName, mobile: "09000000071", status: "active" });
    const [type] = await db.select().from(studioProjectTypes).limit(1);
    const base = { projectTypeId: type.id, programDate: new Date("2030-01-01T10:00:00Z"), items: [{ title: "آیتم تست", unitPrice: 1000 }] };
    a = await createPendingContract(actor, { ...base, customerName: "مشتری ممیزی الف", mobile: "09120000071", idempotencyKey: randomUUID() });
    b = await createPendingContract(actor, { ...base, customerName: "مشتری ممیزی ب", mobile: "09120000072", idempotencyKey: randomUUID() });
    a = await approveContract(actor, a.id);
    b = await approveContract(actor, b.id);
    state.allowed = [a.project.projectId!]; state.deniedProject = b.project.projectId!;
    await db.update(studioContracts).set({ createdAt: range.start }).where(eq(studioContracts.id, a.id));
    await db.update(studioContracts).set({ createdAt: range.start }).where(eq(studioContracts.id, b.id));
    const [account] = await db.insert(accounts).values({ code: `AUDIT-${randomUUID()}`, name: "حساب ممیزی", type: "bank", balance: "1000" }).returning();
    accountId = account.id;
    await db.insert(payments).values([
      { paymentNumber: randomUUID(), projectId: a.project.projectId, invoiceId: a.invoiceId, accountId, amount: "100", paymentDate: range.start, paymentType: "customer_receipt" },
      { paymentNumber: randomUUID(), projectId: a.project.projectId, accountId, amount: "200", paymentDate: range.end, paymentType: "customer_receipt" },
      { paymentNumber: randomUUID(), projectId: a.project.projectId, accountId, amount: "500", paymentDate: new Date(+range.start - 1), paymentType: "customer_receipt" },
      { paymentNumber: randomUUID(), projectId: b.project.projectId, accountId, amount: "999", paymentDate: range.start, paymentType: "customer_receipt" },
      { paymentNumber: randomUUID(), projectId: null, accountId, amount: "888", paymentDate: range.start, paymentType: "customer_receipt" },
    ]);
    const [expense] = await db.insert(expenses).values({ expenseNumber: randomUUID(), title: "هزینه پروژه ب", projectId: b.project.projectId, amount: "10", status: "draft" }).returning();
    expenseId = expense.id;
    await db.insert(expenses).values({ expenseNumber: randomUUID(), title: "هزینه پروژه الف", projectId: a.project.projectId, amount: "10", status: "posted" });
  });
  it("combines range + project without filtering current counts or using invoice lifetime paid totals", async () => {
    const result = await getFinalDashboard(state.allowed, true, { range, projectId: a.project.projectId!, financeProjectIds: state.allowed });
    expect(result.overview).toMatchObject({ contractCount: 1, activeProjects: 1, pendingContracts: 0, finance: { rangeAnalytics: { incoming: 300 } } });
    expect(result.overview.finance!.rangeAnalytics!.points.reduce((sum, point) => sum + point.incoming, 0)).toBe(300);
    const empty = await getFinalDashboard(state.allowed, true, { range: parseDashboardRange("2024-01-01", "2024-01-02"), projectId: a.project.projectId! });
    expect(empty.overview).toMatchObject({ contractCount: 0, activeProjects: 1, finance: { rangeAnalytics: { incoming: 0 } } });
    expect(empty.overview.activities).toHaveLength(0);
  });
  it("redacts nested financial fields and excludes forbidden project finance from reporting", async () => {
    const hidden = await getFinalDashboard(state.allowed, false, { range });
    expect(hidden.overview.finance).toBeNull();
    expect(hidden.overview.recentContracts[0]).toMatchObject({ totalAmount: null, discountAmount: null, itemsTotal: null, project: { totalContractValue: null }, items: [{ unitPrice: null }] });
    const calendar = await getFinalCalendar(state.allowed, []);
    expect(calendar.days[0].contracts[0]).toMatchObject({ totalAmount: null, itemsTotal: null, project: { totalContractValue: null } });
    const mixed = await getFinalDashboard([a.project.projectId!, b.project.projectId!], true, { range, financeProjectIds: state.allowed });
    expect(mixed.overview.recentContracts.find(row => row.id === b.id)!.totalAmount).toBeNull();
    const report = await getAtelierReports([a.project.projectId!, b.project.projectId!], actor.employeeId, true, { finance: true, wages: true, financeIds: state.allowed, wageIds: [] });
    expect(report.finance!.profitability.map(row => row.id)).toEqual([a.project.id]);
    expect(report.finance!.collected).toBe(800);
    const center = await getAtelierFinanceCenter(state.allowed, false);
    expect(center.receipts.every(row => row.projectId === a.project.projectId)).toBe(true);
  });
  it("filters payments, expenses and invoices in SQL before pagination and counts", async () => {
    const query = `?projectId=${a.project.projectId}&pageSize=1`;
    const paymentResponse = await listPayments(new Request(`http://localhost/api/payments${query}`));
    const paymentBody = await paymentResponse.json();
    expect(paymentResponse.status).toBe(200); expect(paymentBody.pagination).toMatchObject({ total: 3, totalPages: 3 });
    expect(paymentBody.payments).toHaveLength(1); expect(paymentBody.payments[0].projectId).toBe(a.project.projectId);
    const expenseBody = await (await listExpenses(new Request(`http://localhost/api/expenses${query}`))).json();
    expect(expenseBody.pagination.total).toBe(1); expect(expenseBody.expenses[0].projectId).toBe(a.project.projectId);
    const invoiceBody = await (await listInvoices(new Request(`http://localhost/api/invoices${query}`))).json();
    expect(invoiceBody.pagination.total).toBe(1); expect(invoiceBody.invoices[0].projectId).toBe(a.project.projectId);
  });
  it("rejects direct read/edit/delete of another project's expense", async () => {
    const params = { params: Promise.resolve({ id: expenseId }) };
    expect((await readExpense(new Request("http://localhost"), params)).status).toBe(403);
    expect((await editExpense(jsonRequest("/api/expenses", "PUT", { title: "غیرمجاز" }), params)).status).toBe(403);
    expect((await deleteExpense(new Request("http://localhost", { method: "DELETE" }), params)).status).toBe(403);
    expect(await db.select().from(expenses).where(eq(expenses.id, expenseId))).toHaveLength(1);
  });
  it("validates account inputs and protects account balances with financial history", async () => {
    for (const body of [{ name: "تست", balance: "NaN" }, { name: "تست", isDefault: "true" }, { name: "تست", type: "invalid" }, { name: "تست", bankName: 5 }]) expect((await createAccount(jsonRequest("/api/accounts", "POST", body))).status).toBe(400);
    expect((await editAccount(jsonRequest("/api/accounts", "PUT", { id: accountId, balance: 999 }))).status).toBe(409);
    expect(Number((await db.select().from(accounts).where(eq(accounts.id, accountId)))[0].balance)).toBe(1000);
  });
  it("creates and edits an unused account, and refuses changes to posted expenses", async () => {
    const response = await createAccount(jsonRequest("/api/accounts", "POST", { name: "صندوق آزمایشی", type: "cash", balance: 0 }));
    expect(response.status).toBe(200); const account = (await response.json()).account;
    const edited = await editAccount(jsonRequest("/api/accounts", "PUT", { id: account.id, name: "صندوق ویرایش", balance: 200, isDefault: false }));
    expect(edited.status).toBe(200); expect((await edited.json()).account).toMatchObject({ name: "صندوق ویرایش", balance: 200 });
    const otherResponse = await createAccount(jsonRequest("/api/accounts", "POST", { name: "حساب سایر آزمایشی", type: "other", balance: 0 }));
    expect(otherResponse.status).toBe(200); const other = (await otherResponse.json()).account;
    expect(other.type).toBe("other");
    expect((await editAccount(jsonRequest("/api/accounts", "PUT", { id: other.id, type: "other", name: "حساب سایر ویرایش" }))).status).toBe(200);
    const [posted] = await db.select().from(expenses).where(eq(expenses.projectId, a.project.projectId!));
    const params = { params: Promise.resolve({ id: posted.id }) };
    expect((await editExpense(jsonRequest("/api/expenses", "PUT", { amount: 20 }), params)).status).toBe(409);
    expect((await deleteExpense(new Request("http://localhost", { method: "DELETE" }), params)).status).toBe(409);
  });
  it("rolls back default account changes when audit insertion fails", async () => {
    const firstResponse = await createAccount(jsonRequest("/api/accounts", "POST", { name: "حساب پیش‌فرض تست", isDefault: true }));
    expect(firstResponse.status).toBe(200); const first = (await firstResponse.json()).account;
    const validActor = state.actorId; state.actorId = randomUUID();
    try {
      const failed = await createAccount(jsonRequest("/api/accounts", "POST", { name: "نباید ذخیره شود", isDefault: true }));
      expect(failed.status).toBe(409);
      expect((await db.select().from(accounts).where(eq(accounts.id, first.id)))[0].isDefault).toBe(true);
      expect(await db.select().from(accounts).where(eq(accounts.name, "نباید ذخیره شود"))).toHaveLength(0);
    } finally { state.actorId = validActor; }
  });
  it("reports more than 300 contracts, including completed statuses, without N+1 hydration", async () => {
    await db.insert(studioContracts).values(Array.from({ length: 300 }, () => ({ contractNumber: `AUDIT-${randomUUID()}`, studioProjectId: a.project.id, projectTypeId: a.projectTypeId, status: "completed", createdAt: range.start, deliveryCommitmentDate: range.end })));
    expect(await listContracts(undefined, state.allowed, true)).toHaveLength(301);
    expect((await getFinalDashboard(state.allowed, false, { range })).overview.contractCount).toBe(301);
    expect(await listContracts(undefined, state.allowed)).toHaveLength(1);
  });
});
