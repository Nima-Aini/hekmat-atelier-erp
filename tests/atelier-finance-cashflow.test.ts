import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { migrateDatabase } from "../src/db/migrate";
import { accounts, atelierExpenseSources, expensePaymentAllocations, expenses, payments, employees } from "../src/db/schema";
import { postCanonicalExpense, postCanonicalExpensePayment } from "../src/services/financial";
import { getAtelierFinanceCenter } from "../src/services/studio/financeCenter";

const actorId = "c8000000-0000-4000-8000-000000000001";
const actor = { userId: actorId, employeeId: actorId, userName: "مدیر تست مالی" };

describe("Atelier finance and cashflow", () => {
  beforeAll(async () => {
    await migrateDatabase();
    await db.insert(employees).values({ id: actorId, code: "ATELIER-FINANCE-TEST", name: actor.userName, mobile: "09000000018", status: "active" }).onConflictDoNothing();
  });

  it("recognizes one canonical payable and settles it partially without duplicate money movement", async () => {
    const [account] = await db.insert(accounts).values({ code: `FIN-${randomUUID()}`, name: "صندوق تست مالی", type: "cash", balance: "20000000", status: "active" }).returning();
    const sourceId = randomUUID();
    const recognized = await db.transaction((tx) => postCanonicalExpense(tx, {
      requestKey: `recognize:${sourceId}`, requestHash: "recognize-v1", title: "دستمزد تدوین", category: "salary", amount: 8_000_000,
      expenseDate: new Date("2026-09-01T00:00:00Z"), dueDate: new Date("2026-09-20T00:00:00Z"), paid: false, sourceType: "personnel_wage", sourceId,
    }, actor));
    expect(recognized.payment).toBeNull();
    const replayRecognition = await db.transaction((tx) => postCanonicalExpense(tx, {
      requestKey: `recognize:${sourceId}`, requestHash: "recognize-v1", title: "دستمزد تدوین", category: "salary", amount: 8_000_000,
      expenseDate: new Date("2026-09-01T00:00:00Z"), dueDate: new Date("2026-09-20T00:00:00Z"), paid: false, sourceType: "personnel_wage", sourceId,
    }, actor));
    expect(replayRecognition.expense.id).toBe(recognized.expense.id);
    const firstKey = randomUUID();
    const first = await db.transaction((tx) => postCanonicalExpensePayment(tx, { requestKey: firstKey, requestHash: "first-v1", expenseId: recognized.expense.id, accountId: account.id, amount: 3_000_000, paymentDate: new Date("2026-09-02T00:00:00Z") }, actor));
    const replay = await db.transaction((tx) => postCanonicalExpensePayment(tx, { requestKey: firstKey, requestHash: "first-v1", expenseId: recognized.expense.id, accountId: account.id, amount: 3_000_000, paymentDate: new Date("2026-09-02T00:00:00Z") }, actor));
    expect(replay.id).toBe(first.id);
    await db.transaction((tx) => postCanonicalExpensePayment(tx, { requestKey: randomUUID(), requestHash: "second-v1", expenseId: recognized.expense.id, accountId: account.id, amount: 5_000_000, paymentDate: new Date("2026-09-03T00:00:00Z") }, actor));
    const [stored] = await db.select().from(expenses).where(eq(expenses.id, recognized.expense.id));
    expect(stored).toMatchObject({ paidAmount: "8000000.00", paymentStatus: "paid" });
    expect(await db.select().from(expensePaymentAllocations).where(eq(expensePaymentAllocations.expenseId, stored.id))).toHaveLength(2);
    expect(await db.select().from(atelierExpenseSources).where(eq(atelierExpenseSources.sourceId, sourceId))).toHaveLength(1);
    expect(Number((await db.select().from(accounts).where(eq(accounts.id, account.id)))[0].balance)).toBe(12_000_000);
    expect((await db.select().from(payments).where(eq(payments.accountId, account.id))).length).toBe(2);
  });

  it("rejects overpayment and inactive payment accounts", async () => {
    const [active] = await db.insert(accounts).values({ code: `FIN-${randomUUID()}`, name: "بانک تست اضافه پرداخت", type: "bank", balance: "10000000", status: "active" }).returning();
    const [inactive] = await db.insert(accounts).values({ code: `FIN-${randomUUID()}`, name: "بانک غیرفعال", type: "bank", balance: "10000000", status: "archived" }).returning();
    const recognized = await db.transaction((tx) => postCanonicalExpense(tx, { requestKey: randomUUID(), requestHash: "overpay-expense", title: "هزینه تست", category: "general", amount: 2_000_000, expenseDate: new Date(), paid: false }, actor));
    await expect(db.transaction((tx) => postCanonicalExpensePayment(tx, { requestKey: randomUUID(), requestHash: "overpay", expenseId: recognized.expense.id, accountId: active.id, amount: 2_000_001, paymentDate: new Date() }, actor))).rejects.toThrow("مانده بدهی");
    await expect(db.transaction((tx) => postCanonicalExpensePayment(tx, { requestKey: randomUUID(), requestHash: "inactive", expenseId: recognized.expense.id, accountId: inactive.id, amount: 1_000_000, paymentDate: new Date() }, actor))).rejects.toThrow("حساب فعال");
  });

  it("builds liquidity, payable, forecast and reports from canonical tables", async () => {
    const center = await getAtelierFinanceCenter(null);
    expect(center.summary.liquidity).toBeGreaterThanOrEqual(12_000_000);
    expect(center.summary.payable).toBeGreaterThanOrEqual(2_000_000);
    expect(center.forecast.map((row) => row.days)).toEqual([7, 30, 60, 90]);
    expect(center.reports.expensesByCategory.some((row) => row.label === "salary")).toBe(true);
  });

  it("keeps one Persian finance menu entry and all eleven internal sections", () => {
    const layout = readFileSync(new URL("../src/components/layout/AppLayout.tsx", import.meta.url), "utf8");
    const view = readFileSync(new URL("../src/components/atelier/AtelierFinanceView.tsx", import.meta.url), "utf8");
    expect((layout.match(/label: "مالی"/g) || [])).toHaveLength(1);
    const order = ["تجهیزات", "مالی", "اعلانات"].map((label) => layout.indexOf(`label: "${label}"`));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    for (const section of ["نمای کلی", "حساب‌ها و صندوق‌ها", "دریافت‌ها", "پرداخت‌ها", "هزینه‌ها", "مطالبات", "بدهی‌ها", "حقوق و دستمزد", "سود قراردادها", "گردش نقدینگی", "گزارش مالی"]) expect(view).toContain(`"${section}"`);
    for (const duplicate of ["studio_payments", "atelier_payments", "atelier_cashflow_ledger"]) expect(view).not.toContain(duplicate);
  });
});
