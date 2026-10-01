import crypto from "node:crypto";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { accounts, equipmentReservations, invoices, payments, rentalEquipment, studioCalendarEvents, studioContractItems, studioContracts, studioPlanningPersonnel, studioProjects } from "@/db/schema";
import { ApiError, assertUuid } from "@/lib/apiError";
import { canAccessPermission, type EmployeeContext } from "@/services/access";
import { logAuditEvent } from "@/services/audit";
import { postCanonicalRefund } from "@/services/financial";
import type { Transaction } from "@/services/product";

async function context(tx: Transaction, actor: EmployeeContext, id: string, permission: string) {
  assertUuid(id);
  const [contract] = await tx.select().from(studioContracts).where(eq(studioContracts.id, id)).for("update").limit(1);
  if (!contract) throw new ApiError(404, "قرارداد یافت نشد.");
  const [project] = await tx.select().from(studioProjects).where(eq(studioProjects.id, contract.studioProjectId)).limit(1);
  if (!project || !(await canAccessPermission(actor, permission, project.projectId))) throw new ApiError(403, "دسترسی به این عملیات قرارداد مجاز نیست.");
  return { contract, project };
}

async function summary(tx: Transaction, contract: typeof studioContracts.$inferSelect) {
  const [invoice] = contract.invoiceId ? await tx.select().from(invoices).where(eq(invoices.id, contract.invoiceId)).for("update").limit(1) : [];
  const receipts = invoice ? await tx.select({ id: payments.id, accountId: payments.accountId, accountName: accounts.name, amount: payments.amount, paymentDate: payments.paymentDate, paymentMethod: payments.paymentMethod }).from(payments).innerJoin(accounts, eq(accounts.id, payments.accountId)).where(and(eq(payments.invoiceId, invoice.id), eq(payments.paymentType, "customer_receipt"), eq(payments.status, "completed"))).orderBy(asc(payments.accountId), asc(payments.id)) : [];
  const received = receipts.reduce((sum, row) => sum + Number(row.amount), 0);
  const total = Number(invoice?.grandTotal ?? contract.totalAmount);
  const snapshot = { contractId: contract.id, status: contract.status, total, received, remaining: Number(invoice?.balanceDue ?? total), invoiceId: invoice?.id || null, invoiceStatus: invoice?.status || null, receipts };
  return { ...snapshot, token: crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex") };
}

export async function getContractCancellationPreview(actor: EmployeeContext, id: string) {
  return db.transaction(async tx => {
    const { contract, project } = await context(tx, actor, id, "studio.contract.cancel");
    if (!(await canAccessPermission(actor, "studio.finance.view", project.projectId))) throw new ApiError(403, "مشاهده اطلاعات مالی مجاز نیست.");
    return summary(tx, contract);
  });
}

export async function deletePreContract(actor: EmployeeContext, id: string) {
  return db.transaction(async tx => {
    const { contract, project } = await context(tx, actor, id, "studio.contract.delete_draft");
    if (contract.status !== "draft" || contract.invoiceId || contract.financialStatus !== "draft") throw new ApiError(409, "فقط پیش‌قرارداد بدون سابقه مالی قابل حذف است.");
    const [financial] = project.projectId ? await tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.projectId, project.projectId)).limit(1) : [];
    if (financial) throw new ApiError(409, "پروژه دارای سند مالی است؛ حذف پیش‌قرارداد مجاز نیست.");
    const items = await tx.select({ id: studioContractItems.id }).from(studioContractItems).where(eq(studioContractItems.contractId, id));
    if (items.length) {
      const ids = items.map(item => item.id);
      const dependencies = await Promise.all([
        tx.select({ id: studioPlanningPersonnel.id }).from(studioPlanningPersonnel).where(inArray(studioPlanningPersonnel.contractItemId, ids)).limit(1),
        tx.select({ id: equipmentReservations.id }).from(equipmentReservations).where(inArray(equipmentReservations.contractItemId, ids)).limit(1),
        tx.select({ id: rentalEquipment.id }).from(rentalEquipment).where(inArray(rentalEquipment.contractItemId, ids)).limit(1),
      ]);
      if (dependencies.some(rows => rows.length)) throw new ApiError(409, "پیش‌قرارداد برنامه‌ریزی وابسته دارد و قابل حذف نیست.");
    }
    const [event] = await tx.select({ id: studioCalendarEvents.id }).from(studioCalendarEvents).where(eq(studioCalendarEvents.contractId, id)).limit(1);
    if (event) throw new ApiError(409, "پیش‌قرارداد رویداد وابسته دارد و قابل حذف نیست.");
    await logAuditEvent("PRECONTRACT_DELETED", "studio_contract", id, { before: contract, customerPreserved: true, projectPreserved: true }, { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName }, tx);
    await tx.delete(studioContracts).where(eq(studioContracts.id, id));
    return { id, deleted: true };
  });
}

export async function cancelContract(actor: EmployeeContext, id: string, input: { token?: unknown; reason?: unknown; confirmed?: unknown }) {
  if (input.confirmed !== true) throw new ApiError(400, "تأیید صریح ابطال الزامی است.");
  const reason = String(input.reason || "").trim();
  if (reason.length < 3 || reason.length > 2000) throw new ApiError(400, "دلیل ابطال را وارد کنید.");
  return db.transaction(async tx => {
    const { contract, project } = await context(tx, actor, id, "studio.contract.cancel");
    if (!(await canAccessPermission(actor, "studio.finance.refund", project.projectId))) throw new ApiError(403, "دسترسی برگشت وجه وجود ندارد.");
    if (contract.status === "cancelled" && contract.cancelledAt) return { id, alreadyCancelled: true, snapshot: contract.cancellationSnapshot };
    if (contract.status !== "signed" || !contract.invoiceId) throw new ApiError(409, "فقط قرارداد تأییدشده از این مسیر باطل می‌شود.");
    const preview = await summary(tx, contract);
    if (preview.token !== input.token) throw new ApiError(409, "اطلاعات مالی تغییر کرده است؛ پیش‌نمایش ابطال را دوباره دریافت کنید.");
    if (!["issued", "corrected"].includes(preview.invoiceStatus || "")) throw new ApiError(409, "وضعیت فاکتور نیاز به بررسی مالی دارد.");
    const audit = { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName };
    const refunds = [];
    for (const receipt of preview.receipts) refunds.push(await postCanonicalRefund(tx, receipt.id, reason, audit));
    const now = new Date();
    await tx.update(invoices).set({ status: "cancelled", paymentStatus: "refunded", paidAmount: "0", balanceDue: "0", reversalReason: reason, settlementDate: null, updatedAt: now }).where(eq(invoices.id, contract.invoiceId));
    await tx.update(studioContracts).set({ status: "cancelled", financialStatus: "reversed", cancelledAt: now, cancellationReason: reason, cancellationSnapshot: { ...preview, refundIds: refunds.map(row => row.id) }, updatedAt: now }).where(eq(studioContracts.id, id));
    await tx.update(studioCalendarEvents).set({ status: "cancelled", updatedAt: now }).where(and(eq(studioCalendarEvents.contractId, id), gte(studioCalendarEvents.startTime, now)));
    const items = await tx.select({ id: studioContractItems.id }).from(studioContractItems).where(eq(studioContractItems.contractId, id));
    if (items.length) {
      await tx.update(equipmentReservations).set({ status: "cancelled", updatedAt: now }).where(and(inArray(equipmentReservations.contractItemId, items.map(item => item.id)), gte(equipmentReservations.reservedFrom, now), eq(equipmentReservations.status, "reserved")));
      await tx.update(studioPlanningPersonnel).set({ status: "cancelled", updatedAt: now }).where(and(inArray(studioPlanningPersonnel.contractItemId, items.map(item => item.id)), gte(studioPlanningPersonnel.startsAt, now), eq(studioPlanningPersonnel.status, "active")));
    }
    // Wages/rental liabilities remain intact: cancelling a sale does not erase obligations.
    await logAuditEvent("CONTRACT_CANCELLED", "studio_contract", id, { ...preview, reason, refunds: refunds.map(row => row.id), accountingOnly: true, obligationsPreserved: true }, audit, tx);
    return { id, alreadyCancelled: false, snapshot: preview, refunds };
  });
}
