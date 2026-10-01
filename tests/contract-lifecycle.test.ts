import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { migrateDatabase } from "../src/db/migrate";
import {
  accounts,
  employees,
  paymentAllocations,
  payments,
  studioContracts,
  studioCustomers,
  studioInstallments,
  studioPlanningPersonnel,
  studioProjects,
  studioProjectTypes,
} from "../src/db/schema";
import type { EmployeeContext } from "../src/services/access";
import { cancelContract, deletePreContract, getContractCancellationPreview } from "../src/services/studio/contractLifecycle";
import { getAtelierFinanceCenter, recordAtelierReceipt, saveContractInstallments } from "../src/services/studio/financeCenter";
import { getFinalNotifications } from "../src/services/studio/finalInsights";
import { approveContract, assignPersonnelToItem, createPendingContract } from "../src/services/studio/finalWorkflow";
import { createStudioPersonnel } from "../src/services/studio/personnelService";

const actorId = "cc000000-0000-4000-8000-000000000001";
const actor: EmployeeContext = { employeeId: actorId, employeeName: "مدیر چرخه قرارداد", permissions: new Set(["*"]) };
const futureStart = () => new Date("2035-06-20T08:00:00.000Z");
const futureEnd = () => new Date("2035-06-20T12:00:00.000Z");
const mobile = () => `0912${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;

describe("contract lifecycle accounting", () => {
  let typeId = "";
  let accountId = "";

  beforeAll(async () => {
    await migrateDatabase();
    await db.insert(employees).values({ id: actorId, code: "CONTRACT-LIFECYCLE", name: actor.employeeName, mobile: "09000000031", status: "active" }).onConflictDoNothing();
    const [type] = await db.select().from(studioProjectTypes).where(eq(studioProjectTypes.code, "wedding")).limit(1);
    typeId = type.id;
    const [account] = await db.insert(accounts).values({ code: `LIFE-${randomUUID()}`, name: "حساب چرخه قرارداد", type: "bank", balance: "50000000", status: "active" }).returning();
    accountId = account.id;
  });

  it("deletes only the draft contract and preserves its customer and project", async () => {
    const draft = await createPendingContract(actor, {
      idempotencyKey: randomUUID(), projectTypeId: typeId, customerName: "مشتری پیش قرارداد", mobile: mobile(),
      programDate: futureStart(), programEndDate: futureEnd(), items: [{ title: "عکاسی", unitPrice: 1_000_000 }],
    });
    const [stored] = await db.select().from(studioContracts).where(eq(studioContracts.id, draft.id));
    const [project] = await db.select().from(studioProjects).where(eq(studioProjects.id, stored.studioProjectId));

    await expect(deletePreContract(actor, draft.id)).resolves.toMatchObject({ id: draft.id, deleted: true });
    expect(await db.select().from(studioContracts).where(eq(studioContracts.id, draft.id))).toHaveLength(0);
    expect(await db.select().from(studioProjects).where(eq(studioProjects.id, project.id))).toHaveLength(1);
    expect(await db.select().from(studioCustomers).where(eq(studioCustomers.id, project.studioCustomerId))).toHaveLength(1);
  });

  it("requires a fresh preview, refunds each receipt exactly once, and removes installments from projections and reminders", async () => {
    const initialBalance = Number((await db.select().from(accounts).where(eq(accounts.id, accountId)))[0].balance);
    const draft = await createPendingContract(actor, {
      idempotencyKey: randomUUID(), projectTypeId: typeId, customerName: "مشتری ابطال", mobile: mobile(),
      programDate: futureStart(), programEndDate: futureEnd(), items: [{ title: "فیلمبرداری", unitPrice: 10_000_000 }],
      paidAmount: 3_000_000, paymentAccountId: accountId,
    });
    const approved = await approveContract(actor, draft.id);
    const [installment] = await saveContractInstallments(actor, approved.id, [{ title: "قسط آینده", amount: 6_000_000, dueDate: new Date(Date.now() + 2 * 86_400_000) }]);
    const stale = await getContractCancellationPreview(actor, approved.id);
    await recordAtelierReceipt(actor, { sourceType: "contract", sourceId: approved.id, accountId, amount: 1_000_000, idempotencyKey: randomUUID() });
    await expect(cancelContract(actor, approved.id, { confirmed: true, reason: "لغو مراسم توسط مشتری", token: stale.token })).rejects.toThrow("اطلاعات مالی تغییر کرده است");

    const preview = await getContractCancellationPreview(actor, approved.id);
    expect(preview.received).toBe(4_000_000);
    const cancelled = await cancelContract(actor, approved.id, { confirmed: true, reason: "لغو مراسم توسط مشتری", token: preview.token });
    expect((cancelled as { refunds: unknown[] }).refunds).toHaveLength(2);
    expect(Number((await db.select().from(accounts).where(eq(accounts.id, accountId)))[0].balance)).toBe(initialBalance);

    const originals = await db.select().from(payments).where(and(eq(payments.invoiceId, approved.invoiceId!), eq(payments.paymentType, "customer_receipt")));
    const refunds = await db.select().from(payments).where(and(eq(payments.invoiceId, approved.invoiceId!), eq(payments.paymentType, "customer_refund")));
    expect(originals).toHaveLength(2);
    expect(originals.every((row) => row.status === "completed")).toBe(true);
    expect(refunds).toHaveLength(2);
    expect(await db.select().from(paymentAllocations).where(eq(paymentAllocations.invoiceId, approved.invoiceId!))).toHaveLength(2);

    const replay = await cancelContract(actor, approved.id, { confirmed: true, reason: "لغو مراسم توسط مشتری", token: preview.token });
    expect(replay.alreadyCancelled).toBe(true);
    expect(await db.select().from(payments).where(and(eq(payments.invoiceId, approved.invoiceId!), eq(payments.paymentType, "customer_refund")))).toHaveLength(2);
    expect(Number((await db.select().from(accounts).where(eq(accounts.id, accountId)))[0].balance)).toBe(initialBalance);
    expect((await getAtelierFinanceCenter(null)).installments.some((row) => row.id === installment.id)).toBe(false);
    expect((await getFinalNotifications(null, false, actor)).some((row) => row.conditionKey === `installment-due:${installment.id}`)).toBe(false);
    expect(await db.select().from(studioInstallments).where(eq(studioInstallments.id, installment.id))).toHaveLength(1);
  });

  it("marks future personnel planning cancelled so it no longer blocks another contract", async () => {
    const person = await createStudioPersonnel({ fullName: "عکاس چرخه قرارداد", mobile: mobile(), personnelType: "temporary_worker", primaryRole: "photographer", status: "active" });
    const makeContract = async (name: string) => approveContract(actor, (await createPendingContract(actor, {
      idempotencyKey: randomUUID(), projectTypeId: typeId, customerName: name, mobile: mobile(),
      programDate: futureStart(), programEndDate: futureEnd(), items: [{ title: "عکاسی مراسم", unitPrice: 2_000_000 }],
    })).id);
    const first = await makeContract("مشتری برنامه لغوشده");
    const second = await makeContract("مشتری برنامه جایگزین");
    const assignment = await assignPersonnelToItem(actor, first.items[0].id, { personnelId: person.id, startsAt: futureStart(), endsAt: futureEnd(), wageAmount: 500_000 });
    const preview = await getContractCancellationPreview(actor, first.id);
    await cancelContract(actor, first.id, { confirmed: true, reason: "لغو برنامه آینده", token: preview.token });
    expect((await db.select().from(studioPlanningPersonnel).where(eq(studioPlanningPersonnel.id, assignment.id)))[0].status).toBe("cancelled");
    await expect(assignPersonnelToItem(actor, second.items[0].id, { personnelId: person.id, startsAt: futureStart(), endsAt: futureEnd(), wageAmount: 600_000 })).resolves.toMatchObject({ status: "active" });
  });

  it("shows the cancellation action only when contract, finance-view, and refund permissions are all present", () => {
    const source = readFileSync(new URL("../src/components/atelier/ContractsView.tsx", import.meta.url), "utf8");
    expect(source).toContain('hasPermission("studio.contract.cancel") && hasPermission("studio.finance.view") && hasPermission("studio.finance.refund")');
  });
});
