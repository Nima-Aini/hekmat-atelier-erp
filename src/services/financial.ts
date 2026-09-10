import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { accounts, expenses, invoices, paymentAllocations, payments } from "@/db/schema";
import type { Transaction } from "@/services/product";
import { ApiError, assertUuid, decimal } from "@/lib/apiError";
import { logAuditEvent, type AuditContext } from "@/services/audit";

const documentNumber = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

export interface CanonicalReceiptInput {
  requestKey: string; requestHash: string; customerId: string; projectId: string; invoiceId: string; accountId: string;
  amount: number | string; paymentDate: Date; paymentMethod: string; referenceNumber?: string | null; notes?: string | null;
}

export async function postCanonicalReceipt(tx: Transaction, input: CanonicalReceiptInput, actor: AuditContext) {
  [input.customerId, input.projectId, input.invoiceId, input.accountId].forEach(assertUuid);
  const amount = Number(decimal(input.amount, "مبلغ دریافت", 2, true));
  if (Number.isNaN(input.paymentDate.getTime())) throw new ApiError(400, "تاریخ پرداخت نامعتبر است.");
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.requestKey}, 0))`);
  const [prior] = await tx.select().from(payments).where(eq(payments.requestKey, input.requestKey)).limit(1);
  if (prior) { if (prior.requestHash !== input.requestHash) throw new ApiError(409, "کلید درخواست با اطلاعات دیگری استفاده شده است."); return prior; }
  const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, input.invoiceId)).for("update").limit(1);
  if (!invoice) throw new ApiError(404, "فاکتور یافت نشد.");
  if (invoice.projectId !== input.projectId || invoice.customerId !== input.customerId) throw new ApiError(422, "فاکتور با مشتری یا پروژه مطابقت ندارد.");
  if (["cancelled", "reversed"].includes(invoice.status)) throw new ApiError(409, "فاکتور باطل‌شده قابل پرداخت نیست.");
  if (amount > Number(invoice.balanceDue)) throw new ApiError(422, "مبلغ دریافت از مانده فاکتور بیشتر است.");
  const [account] = await tx.select().from(accounts).where(and(eq(accounts.id, input.accountId), eq(accounts.status, "active"))).for("update").limit(1);
  if (!account) throw new ApiError(404, "حساب فعال دریافت یافت نشد.");
  const [payment] = await tx.insert(payments).values({ requestKey: input.requestKey, requestHash: input.requestHash, paymentNumber: documentNumber("PAY"), customerId: input.customerId, invoiceId: input.invoiceId, projectId: input.projectId, accountId: input.accountId, paymentType: "customer_receipt", amount: amount.toFixed(2), paymentDate: input.paymentDate, paymentMethod: input.paymentMethod, referenceNumber: input.referenceNumber || null, notes: input.notes || null, status: "completed" }).returning();
  await tx.update(accounts).set({ balance: sql`${accounts.balance} + ${amount}` }).where(eq(accounts.id, input.accountId));
  await tx.insert(paymentAllocations).values({ paymentId: payment.id, invoiceId: invoice.id, allocatedAmount: amount.toFixed(2) });
  const paidAmount = Number(invoice.paidAmount) + amount;
  const balanceDue = Math.max(0, Number(invoice.grandTotal) - paidAmount);
  await tx.update(invoices).set({ paidAmount: paidAmount.toFixed(2), balanceDue: balanceDue.toFixed(2), paymentStatus: balanceDue === 0 ? "paid" : "partial", settlementDate: balanceDue === 0 ? input.paymentDate : null, updatedAt: new Date() }).where(eq(invoices.id, invoice.id));
  await logAuditEvent("CREATE", "payment", payment.id, { projectId: input.projectId, invoiceId: invoice.id, amount, accountId: account.id }, actor, tx);
  console.info("financial.receipt_posted", { paymentId: payment.id, projectId: input.projectId, invoiceId: invoice.id, accountId: account.id });
  return payment;
}

export interface CanonicalExpenseInput {
  requestKey: string; requestHash: string; projectId?: string | null; accountId?: string | null; employeeId?: string | null;
  title: string; category: string; amount: number | string; expenseDate: Date; description?: string | null;
  paymentType?: "expense_payment" | "salary_payout" | "supplier_payment"; paymentMethod?: string; supplierId?: string | null; paid: boolean;
}

export async function postCanonicalExpense(tx: Transaction, input: CanonicalExpenseInput, actor: AuditContext) {
  if (input.projectId) assertUuid(input.projectId); if (input.accountId) assertUuid(input.accountId); if (input.employeeId) assertUuid(input.employeeId);
  const amount = Number(decimal(input.amount, "مبلغ هزینه", 2, true));
  if (!input.title.trim()) throw new ApiError(400, "عنوان هزینه الزامی است.");
  if (Number.isNaN(input.expenseDate.getTime())) throw new ApiError(400, "تاریخ هزینه نامعتبر است.");
  if (input.paid && !input.accountId) throw new ApiError(400, "انتخاب حساب پرداخت برای هزینه پرداخت‌شده الزامی است.");
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.requestKey}, 0))`);
  const [priorPayment] = await tx.select().from(payments).where(eq(payments.requestKey, input.requestKey)).limit(1);
  if (priorPayment) {
    if (priorPayment.requestHash !== input.requestHash) throw new ApiError(409, "کلید درخواست با اطلاعات دیگری استفاده شده است.");
    const [priorExpense] = await tx.select().from(expenses).where(eq(expenses.paymentId, priorPayment.id)).limit(1);
    if (!priorExpense) throw new ApiError(409, "درخواست قبلی ناقص است و نیاز به بررسی حسابداری دارد.");
    return { expense: priorExpense, payment: priorPayment };
  }
  let payment: typeof payments.$inferSelect | null = null;
  if (input.paid && input.accountId) {
    const [account] = await tx.select().from(accounts).where(and(eq(accounts.id, input.accountId), eq(accounts.status, "active"))).for("update").limit(1);
    if (!account) throw new ApiError(404, "حساب فعال پرداخت یافت نشد.");
    if (Number(account.balance) < amount) throw new ApiError(422, "موجودی حساب برای ثبت این پرداخت کافی نیست.");
    [payment] = await tx.insert(payments).values({ requestKey: input.requestKey, requestHash: input.requestHash, paymentNumber: documentNumber("PAY-EXP"), supplierId: input.supplierId || null, projectId: input.projectId || null, accountId: input.accountId, paymentType: input.paymentType || "expense_payment", amount: amount.toFixed(2), paymentDate: input.expenseDate, paymentMethod: input.paymentMethod || "bank_transfer", notes: input.description || input.title, status: "completed" }).returning();
    await tx.update(accounts).set({ balance: sql`${accounts.balance} - ${amount}` }).where(eq(accounts.id, account.id));
  }
  const [expense] = await tx.insert(expenses).values({ expenseNumber: documentNumber("EXP"), title: input.title.trim(), category: input.category, amount: amount.toFixed(2), projectId: input.projectId || null, employeeId: input.employeeId || null, accountId: input.accountId || null, paymentId: payment?.id || null, expenseDate: input.expenseDate, description: input.description || null, status: "posted" }).returning();
  await logAuditEvent("CREATE", "expense", expense.id, { projectId: input.projectId || null, amount, accountId: input.accountId || null, paymentId: payment?.id || null }, actor, tx);
  console.info("financial.expense_posted", { expenseId: expense.id, projectId: input.projectId || null, paymentId: payment?.id || null, accountId: input.accountId || null });
  return { expense, payment };
}
