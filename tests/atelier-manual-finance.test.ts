import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { migrateDatabase } from "../src/db/migrate";
import { accounts, atelierExpenseCategories, employees, expenses, payments } from "../src/db/schema";
import { saveExpenseCategory } from "../src/services/studio/expenseCategories";
import { createAtelierExpense, getAtelierFinanceCenter, recordAtelierReceipt } from "../src/services/studio/financeCenter";

const actor = {
  employeeId: "00000000-0000-4000-8000-000000000091",
  employeeName: "Manual finance test",
  permissions: new Set(["*"]),
};

describe("manual atelier finance and expense categories", () => {
  beforeAll(async () => {
    await migrateDatabase();
    await db.insert(employees).values({ id: actor.employeeId, code: "MANUAL-FINANCE-TEST", name: actor.employeeName, mobile: "09000000091" }).onConflictDoNothing();
  });

  it("posts a manual receipt once and rejects a changed replay", async () => {
    const [account] = await db.insert(accounts).values({ code: `MAN-IN-${randomUUID()}`, name: "Manual receipt account", type: "cash", balance: "1000" }).returning();
    const idempotencyKey = randomUUID();
    const input = {
      sourceType: "manual", accountId: account.id, amount: 2500, title: "دریافت متفرقه",
      counterparty: "طرف حساب آزمایشی", notes: "یادداشت دریافت", paymentMethod: "cash",
      paidAt: "2026-09-30T10:00:00.000Z", idempotencyKey,
    };
    const first = await recordAtelierReceipt(actor, input);
    const replay = await recordAtelierReceipt(actor, input);

    expect(replay.id).toBe(first.id);
    expect(Number((await db.select().from(accounts).where(eq(accounts.id, account.id)))[0].balance)).toBe(3500);
    expect(await db.select().from(payments).where(eq(payments.requestKey, `atelier-manual-receipt:${idempotencyKey}`))).toHaveLength(1);
    await expect(recordAtelierReceipt(actor, { ...input, notes: "اطلاعات متفاوت" })).rejects.toThrow("کلید درخواست");

    const center = await getAtelierFinanceCenter();
    expect(center.receipts.find((row) => row.id === first.id)).toMatchObject({ title: "دریافت متفرقه", counterparty: "طرف حساب آزمایشی", amount: 2500 });
  });

  it("creates, edits and deactivates categories while retaining historical reports", async () => {
    const category = await saveExpenseCategory(actor, { code: `custom_${randomUUID().replaceAll("-", "")}`, title: "هزینه سفارشی", sortOrder: 12 });
    const [account] = await db.insert(accounts).values({ code: `MAN-OUT-${randomUUID()}`, name: "Manual expense account", type: "cash", balance: "10000" }).returning();
    const idempotencyKey = randomUUID();
    const input = {
      title: "خرید آزمایشی", category: category.code, amount: 1200, accountId: account.id,
      paid: true, paymentMethod: "cash", counterparty: "فروشنده تست", notes: "شرح هزینه",
      expenseDate: "2026-09-29T09:00:00.000Z", dueDate: "2026-10-02T09:00:00.000Z", idempotencyKey,
    };
    const first = await createAtelierExpense(actor, input);
    const replay = await createAtelierExpense(actor, input);
    if (!("expense" in first) || !("expense" in replay)) throw new Error("manual expense must use the canonical response");

    expect(replay.expense.id).toBe(first.expense.id);
    expect(Number((await db.select().from(accounts).where(eq(accounts.id, account.id)))[0].balance)).toBe(8800);
    expect(await db.select().from(expenses).where(eq(expenses.requestKey, `atelier-general-expense:${idempotencyKey}`))).toHaveLength(1);
    expect(first.expense).toMatchObject({ counterparty: "فروشنده تست", sourceType: "manual" });
    await expect(createAtelierExpense(actor, { ...input, notes: "شرح تغییرکرده" })).rejects.toThrow("کلید درخواست");
    await expect(createAtelierExpense(actor, { ...input, paymentMethod: "bank_transfer" })).rejects.toThrow("کلید درخواست");
    await expect(createAtelierExpense(actor, { ...input, dueDate: "2026-10-03T09:00:00.000Z" })).rejects.toThrow("کلید درخواست");

    await saveExpenseCategory(actor, { title: "عنوان ویرایش‌شده", active: false, sortOrder: 20 }, category.code);
    await expect(createAtelierExpense(actor, { ...input, idempotencyKey: randomUUID() })).rejects.toThrow("دسته هزینه فعال");
    const center = await getAtelierFinanceCenter();
    expect(center.expenses.find((row) => row.id === first.expense.id)).toBeTruthy();
    expect(center.reports.expensesByCategory).toContainEqual({ label: "عنوان ویرایش‌شده", amount: 1200 });
  });

  it("edits a legacy Persian code but never creates an arbitrary unsafe code", async () => {
    const legacyCode = `قدیمی-${randomUUID()}`;
    await db.insert(atelierExpenseCategories).values({ code: legacyCode, title: "عنوان قدیمی" });
    const edited = await saveExpenseCategory(actor, { title: "عنوان جدید", active: false }, legacyCode);
    expect(edited).toMatchObject({ code: legacyCode, title: "عنوان جدید", active: false });

    await expect(saveExpenseCategory(actor, { title: "نباید ساخته شود" }, `جدید-${randomUUID()}`)).rejects.toThrow("یافت نشد");
    const safelyGenerated = await saveExpenseCategory(actor, { code: "کد فارسی جدید", title: "دسته امن" });
    expect(safelyGenerated.code).toMatch(/^category_[a-f0-9]{12}$/);
  });
});
