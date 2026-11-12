import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { migrateDatabase } from "../src/db/migrate";
import { employees, studioPersonnel, personnelSalaryRecords, accounts, payments } from "../src/db/schema";
import { settleAtelierObligation } from "../src/services/studio/financeCenter";
import { getPersonnelFinancialFile } from "../src/services/studio/personnelFinance";
const actor = { employeeId: "00000000-0000-4000-8000-000000000081", employeeName: "Wage test", permissions: new Set(["*"]) };
describe("personnel canonical wage payments", () => {
  beforeAll(async () => { await migrateDatabase(); await db.insert(employees).values({ id: actor.employeeId, code: "WAGE-TEST", name: "Wage test", mobile: "09000000081" }).onConflictDoNothing(); });
  it("supports partial payment, rejects overpayment and replays without moving money twice", async () => {
    const [person] = await db.insert(studioPersonnel).values({ fullName: "Wage test", mobile: "09000000082", primaryRole: "editor" }).returning();
    const [salary] = await db.insert(personnelSalaryRecords).values({ personnelId: person.id, totalCalculated: "1000000" }).returning();
    const [account] = await db.insert(accounts).values({ code: `WAGE-${randomUUID()}`, name: "Wage cash", type: "cash", balance: "2000000" }).returning();
    const input = { amount: 400000, accountId: account.id, paymentDate: "2026-09-30T10:00:00Z", paymentMethod: "cash", idempotencyKey: randomUUID(), notes: "partial wage" };
    const first = await settleAtelierObligation(actor, "personnel_wage", salary.id, input);
    const replay = await settleAtelierObligation(actor, "personnel_wage", salary.id, input);
    expect(replay.payment.id).toBe(first.payment.id);
    await expect(settleAtelierObligation(actor, "personnel_wage", salary.id, { ...input, amount: 600001, idempotencyKey: randomUUID() })).rejects.toThrow("مانده بدهی");
    const file = await getPersonnelFinancialFile(person.id);
    expect(file.totals).toMatchObject({ earned: 1000000, paid: 400000, remaining: 600000 });
    expect(Number((await db.select().from(accounts).where(eq(accounts.id, account.id)))[0].balance)).toBe(1600000);
    expect(await db.select().from(payments).where(eq(payments.accountId, account.id))).toHaveLength(1);
    await settleAtelierObligation(actor, "personnel_wage", salary.id, { ...input, amount: 600000, idempotencyKey: randomUUID() });
    expect((await db.select().from(personnelSalaryRecords).where(eq(personnelSalaryRecords.id, salary.id)))[0].paymentStatus).toBe("paid");
  });
});
