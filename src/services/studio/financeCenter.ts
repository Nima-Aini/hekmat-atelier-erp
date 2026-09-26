import crypto from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accountBalanceAdjustments, accounts, atelierExpenseSources, auditLogs, customers, expensePaymentAllocations, expenses, invoices, payments,
  personnelSalaryRecords, rentalEquipment, studioContracts, studioDailyVisits, studioInstallmentAllocations,
  studioInstallments, studioPersonnel, studioProjects, studioProjectTypes, studioReservations, studioDailyVisitPersonnel, studioContractItems,
} from "@/db/schema";
import { ApiError, assertUuid, decimal } from "@/lib/apiError";
import { canAccessPermission, type EmployeeContext } from "@/services/access";
import { logAuditEvent } from "@/services/audit";
import { postCanonicalExpense, postCanonicalExpensePayment, postCanonicalReceipt } from "@/services/financial";
import { createStudioExpense, createStudioPayment } from "@/services/studio/projectService";
import { buildOverviewAnalytics } from "./overviewAnalytics";

const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const n = (value: unknown) => Number(value || 0);
async function assertFinanceScope(actor: EmployeeContext, projectId: string | null | undefined) {
  if (projectId && !(await canAccessPermission(actor, "studio.finance.manage", projectId))) throw new ApiError(403, "دسترسی مالی به این پروژه مجاز نیست.", "PROJECT_SCOPE_FORBIDDEN");
}

export async function getAtelierFinanceCenter(allowedCoreProjectIds: string[] | null = null) {
  const [accountRows, rawPaymentRows, rawExpenseRows, rawContracts, visits, reservations, rawSalaries, rawRentals, rawInstallmentRows] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.status, "active")).orderBy(desc(accounts.isDefault), asc(accounts.name)),
    db.select({ payment: payments, accountName: accounts.name }).from(payments).innerJoin(accounts, eq(accounts.id, payments.accountId)).where(eq(payments.status, "completed")).orderBy(desc(payments.paymentDate)),
    db.select({ expense: expenses, accountName: accounts.name }).from(expenses).leftJoin(accounts, eq(accounts.id, expenses.accountId)).where(eq(expenses.status, "posted")).orderBy(desc(expenses.expenseDate)),
    db.select({ contract: studioContracts, projectTitle: studioProjects.title, projectType: studioProjectTypes.title, invoice: invoices, customerName: customers.name, customerMobile: customers.mobile })
      .from(studioContracts).innerJoin(studioProjects, eq(studioProjects.id, studioContracts.studioProjectId))
      .leftJoin(studioProjectTypes, eq(studioProjectTypes.id, studioContracts.projectTypeId))
      .leftJoin(invoices, eq(invoices.id, studioContracts.invoiceId)).leftJoin(customers, eq(customers.id, invoices.customerId)),
    db.select().from(studioDailyVisits).where(eq(studioDailyVisits.status, "active")),
    db.select().from(studioReservations).where(sql`${studioReservations.status} <> 'cancelled'`),
    db.select({ salary: personnelSalaryRecords, personnelName: studioPersonnel.fullName, projectTitle: studioProjects.title, coreProjectId: studioProjects.projectId })
      .from(personnelSalaryRecords).innerJoin(studioPersonnel, eq(studioPersonnel.id, personnelSalaryRecords.personnelId)).leftJoin(studioProjects, eq(studioProjects.id, personnelSalaryRecords.studioProjectId)),
    db.select({ rental: rentalEquipment, projectTitle: studioProjects.title, coreProjectId: studioProjects.projectId }).from(rentalEquipment).leftJoin(studioProjects, eq(studioProjects.id, rentalEquipment.studioProjectId)),
    db.select().from(studioInstallments).orderBy(asc(studioInstallments.dueDate)),
  ]);
  const allowed = allowedCoreProjectIds === null ? null : new Set(allowedCoreProjectIds);
  const contracts = allowed === null ? rawContracts : rawContracts.filter((row) => !row.invoice?.projectId || allowed.has(row.invoice.projectId));
  const expenseRows = allowed === null ? rawExpenseRows : rawExpenseRows.filter((row) => !row.expense.projectId || allowed.has(row.expense.projectId));
  const salaries = allowed === null ? rawSalaries : rawSalaries.filter((row) => !row.coreProjectId || allowed.has(row.coreProjectId));
  const rentals = allowed === null ? rawRentals : rawRentals.filter((row) => !row.coreProjectId || allowed.has(row.coreProjectId));
  const paymentRows = allowed === null ? rawPaymentRows : rawPaymentRows.filter((row) => !row.payment.projectId || allowed.has(row.payment.projectId));
  const visibleContractIds = new Set(contracts.map((row) => row.contract.id));
  const installmentRows = rawInstallmentRows.filter((row) => visibleContractIds.has(row.contractId));
  const allocations = await db.select().from(expensePaymentAllocations);
  const dailySalarySources = rawSalaries.length ? await db.select({ salaryRecordId: studioDailyVisitPersonnel.salaryRecordId, visitTitle: studioDailyVisits.title }).from(studioDailyVisitPersonnel).innerJoin(studioDailyVisits, eq(studioDailyVisits.id, studioDailyVisitPersonnel.dailyVisitId)).where(inArray(studioDailyVisitPersonnel.salaryRecordId, rawSalaries.map((row) => row.salary.id))) : [];
  const expenseSources = await db.select().from(atelierExpenseSources);
  const installmentAllocations = await db.select().from(studioInstallmentAllocations);
  const contractItems = visibleContractIds.size ? await db.select().from(studioContractItems).where(inArray(studioContractItems.contractId, [...visibleContractIds])) : [];
  const correctionRows = visibleContractIds.size ? await db.select().from(auditLogs).where(and(eq(auditLogs.entityType, "studio_contract"), inArray(auditLogs.entityId, [...visibleContractIds]))).orderBy(desc(auditLogs.createdAt)) : [];
  const adjustmentRows = accountRows.length ? await db.select().from(accountBalanceAdjustments).where(inArray(accountBalanceAdjustments.accountId, accountRows.map((row) => row.id))).orderBy(desc(accountBalanceAdjustments.adjustedAt)) : [];
  const paidByExpense = new Map<string, number>();
  for (const row of allocations) paidByExpense.set(row.expenseId, (paidByExpense.get(row.expenseId) || 0) + n(row.allocatedAmount));
  const income = paymentRows.filter(({ payment }) => payment.paymentType === "customer_receipt").reduce((sum, row) => sum + n(row.payment.amount), 0);
  const outcome = paymentRows.filter(({ payment }) => payment.paymentType !== "customer_receipt").reduce((sum, row) => sum + n(row.payment.amount), 0);
  const payable = expenseRows.reduce((sum, row) => sum + Math.max(0, n(row.expense.amount) - n(row.expense.paidAmount)), 0);
  const projectCosts = new Map<string, number>();
  for (const { expense } of expenseRows) if (expense.projectId) projectCosts.set(expense.projectId, (projectCosts.get(expense.projectId) || 0) + n(expense.amount));
  const profitRows = contracts.filter(({ contract }) => contract.status === "signed").map(({ contract, invoice, projectTitle, projectType }) => {
    const project = contracts.find((row) => row.contract.id === contract.id);
    const coreId = project?.invoice?.projectId || null;
    const revenue = n(invoice?.grandTotal || contract.totalAmount), costs = coreId ? projectCosts.get(coreId) || 0 : 0;
    return { contractId: contract.id, contractNumber: contract.contractNumber, projectTitle, projectType, revenue, costs, profit: revenue - costs, margin: revenue ? ((revenue - costs) / revenue) * 100 : 0 };
  });
  const sourceByInvoice = new Map<string, { type: string; id: string; title: string }>();
  for (const { contract, projectTitle } of contracts) if (contract.invoiceId) sourceByInvoice.set(contract.invoiceId, { type: "contract", id: contract.id, title: `${contract.contractNumber} — ${projectTitle}` });
  for (const row of visits) if (row.invoiceId) sourceByInvoice.set(row.invoiceId, { type: "daily_visit", id: row.id, title: row.title });
  const receipts = paymentRows.filter(({ payment }) => payment.paymentType === "customer_receipt").map(({ payment, accountName }) => ({ ...payment, amount: n(payment.amount), accountName, source: payment.invoiceId ? sourceByInvoice.get(payment.invoiceId) || null : null }));
  const outgoings = paymentRows.filter(({ payment }) => payment.paymentType !== "customer_receipt").map(({ payment, accountName }) => ({ ...payment, amount: n(payment.amount), accountName }));
  const expenseList = expenseRows.map(({ expense, accountName }) => { const source = expenseSources.find((row) => row.expenseId === expense.id); return { ...expense, amount: n(expense.amount), paidAmount: n(expense.paidAmount), remainingAmount: Math.max(0, n(expense.amount) - n(expense.paidAmount)), accountName, sourceType: source?.sourceType || null, sourceId: source?.sourceId || null }; });
  const expenseById = new Map(expenseList.map((row) => [row.id, row]));
  const personnelDebt = expenseSources.filter((row) => row.sourceType === "personnel_wage").reduce((sum, row) => sum + (expenseById.get(row.expenseId)?.remainingAmount || 0), 0);
  const rentalDebt = expenseSources.filter((row) => row.sourceType === "rental").reduce((sum, row) => sum + (expenseById.get(row.expenseId)?.remainingAmount || 0), 0);
  const receivableSources = [
    ...contracts.filter((row) => row.invoice && n(row.invoice.balanceDue) > 0).map((row) => ({ sourceType: "contract", sourceId: row.contract.id, title: `${row.contract.contractNumber} — ${row.customerName || row.projectTitle}`, remainingAmount: n(row.invoice!.balanceDue), dueDate: row.invoice!.dueDate })),
    ...visits.filter((row) => row.invoiceId && n(row.price) > n(row.paidAmount)).map((row) => ({ sourceType: "daily_visit", sourceId: row.id, title: `مراجعه: ${row.title} — ${row.customerName}`, remainingAmount: n(row.price) - n(row.paidAmount), dueDate: row.visitDate })),
  ];
  const receivable = receivableSources.reduce((sum, row) => sum + row.remainingAmount, 0);
  const sourceExpense = (sourceType: string, sourceId: string) => { const link = expenseSources.find((row) => row.sourceType === sourceType && row.sourceId === sourceId); return link ? expenseList.find((row) => row.id === link.expenseId) : undefined; };
  const salaryList = salaries.map(({ salary, ...rest }) => { const expense = sourceExpense("personnel_wage", salary.id); const daily = dailySalarySources.find((row) => row.salaryRecordId === salary.id); return { ...salary, ...rest, sourceType: daily ? "daily_visit" : "contract", sourceLabel: daily ? "مراجعه روزانه" : "قرارداد", sourceTitle: daily?.visitTitle || rest.projectTitle || "—", totalCalculated: n(salary.totalCalculated), paidAmount: expense?.paidAmount || 0, remainingAmount: expense?.remainingAmount ?? n(salary.totalCalculated) }; });
  const rentalList = rentals.map(({ rental, ...rest }) => { const expense = sourceExpense("rental", rental.id); return { ...rental, ...rest, rentalCost: n(rental.rentalCost), paidAmount: expense?.paidAmount || 0, remainingAmount: expense?.remainingAmount ?? n(rental.rentalCost) }; });
  const now = new Date();
  const installments = installmentRows.map((row) => {
    const contract = contracts.find((entry) => entry.contract.id === row.contractId)!;
    const paidAmount = installmentAllocations.filter((a) => a.installmentId === row.id).reduce((s, a) => s + n(a.amount), 0);
    const remainingAmount = Math.max(0, n(row.amount) - paidAmount);
    const daysToDue = Math.ceil((new Date(row.dueDate).getTime() - now.getTime()) / 86_400_000);
    const status = remainingAmount === 0 ? "paid" : paidAmount > 0 ? "partial" : daysToDue < 0 ? "overdue" : daysToDue <= 7 ? "due_soon" : "pending";
    return { ...row, amount: n(row.amount), paidAmount, remainingAmount, status, daysToDue, customerName: contract.customerName, customerMobile: contract.customerMobile, contractNumber: contract.contract.contractNumber, projectTitle: contract.projectTitle, projectType: contract.projectType, programDate: contract.contract.programDate };
  });
  const contractFinance = contracts.map(({ contract, invoice, customerName, customerMobile, projectTitle, projectType }) => ({
    id: contract.id, studioProjectId: contract.studioProjectId, coreProjectId: invoice?.projectId || null, contractNumber: contract.contractNumber, customerName, customerMobile, projectTitle, projectType,
    itemsSubtotal: contractItems.filter((row) => row.contractId === contract.id).reduce((sum, row) => sum + n(row.quantity) * n(row.unitPrice), 0),
    discountAmount: n(contract.discountAmount), finalAmount: n(invoice?.grandTotal || contract.totalAmount), paidAmount: n(invoice?.paidAmount), remainingAmount: n(invoice?.balanceDue),
    financialNotes: contract.financialNotes, programDate: contract.programDate,
    receipts: receipts.filter((row) => row.invoiceId === contract.invoiceId),
    corrections: correctionRows.filter((row) => row.entityId === contract.id && ["ATELIER_CONTRACT_FINANCE_UPDATED", "ATELIER_INSTALLMENTS_UPDATED"].includes(row.action)),
  }));
  const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
  const receivedThisMonth = receipts.filter((row) => new Date(row.paymentDate) >= startOfMonth).reduce((sum, row) => sum + row.amount, 0);
  const paidThisMonth = outgoings.filter((row) => new Date(row.paymentDate) >= startOfMonth).reduce((sum, row) => sum + row.amount, 0);
  const expensesThisMonth = expenseList.filter((row) => new Date(row.expenseDate) >= startOfMonth).reduce((sum, row) => sum + row.amount, 0);
  const contractedThisMonth = contracts.filter((row) => row.contract.status === "signed" && new Date(row.contract.createdAt) >= startOfMonth).reduce((sum, row) => sum + n(row.invoice?.grandTotal || row.contract.totalAmount), 0);
  const estimatedProfitThisMonth = profitRows.filter((row) => {
    const contract = contracts.find((entry) => entry.contract.id === row.contractId)?.contract;
    return contract && new Date(contract.createdAt) >= startOfMonth;
  }).reduce((sum, row) => sum + row.profit, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const forecast = [7, 30, 60, 90].map((days) => {
    const end = new Date(today); end.setDate(end.getDate() + days);
    const incoming = receivableSources.filter((row) => row.dueDate && new Date(row.dueDate) >= today && new Date(row.dueDate) <= end).reduce((sum, row) => sum + row.remainingAmount, 0);
    const outgoing = expenseList.filter((row) => row.remainingAmount > 0 && row.dueDate && new Date(row.dueDate) >= today && new Date(row.dueDate) <= end).reduce((sum, row) => sum + row.remainingAmount, 0);
    return { days, incoming, outgoing, net: incoming - outgoing };
  });
  const byKey = (rows: Array<{ key: string; amount: number }>) => [...rows.reduce((map, row) => map.set(row.key, (map.get(row.key) || 0) + row.amount), new Map<string, number>())].map(([label, amount]) => ({ label, amount }));
  const reports = {
    incomeBySource: byKey(receipts.map((row) => ({ key: row.source?.type === "contract" ? "قرارداد" : row.source?.type === "daily_visit" ? "مراجعه روزانه" : row.source?.type === "reservation" ? "رزرو" : "سایر", amount: row.amount }))),
    expensesByCategory: byKey(expenseList.map((row) => ({ key: row.category || "سایر", amount: row.amount }))),
    profitByProjectType: byKey(profitRows.map((row) => ({ key: row.projectType || "سایر", amount: row.profit }))),
  };
  return {
    summary: { liquidity: accountRows.reduce((sum, row) => sum + n(row.balance), 0), received: income, paid: outcome, receivable, payable, personnelDebt, rentalDebt, netCashflow: income - outcome, receivedThisMonth, paidThisMonth, expensesThisMonth, contractedThisMonth, estimatedProfitThisMonth },
    accounts: accountRows.map((row) => ({ ...row, balance: n(row.balance), adjustments: adjustmentRows.filter((item) => item.accountId === row.id) })), receipts, payments: outgoings, expenses: expenseList,
    receivables: contracts.filter((row) => row.invoice && n(row.invoice.balanceDue) > 0).map((row) => ({ contractId: row.contract.id, contractNumber: row.contract.contractNumber, projectTitle: row.projectTitle, customerName: row.customerName, dueDate: row.invoice!.dueDate, amount: n(row.invoice!.balanceDue) })), receivableSources,
    payables: expenseList.filter((row) => row.remainingAmount > 0 && row.sourceType !== "personnel_wage"), salaries: salaryList, rentals: rentalList, profitability: profitRows, installments, contractFinance,
    cashflow: buildCashflow(receipts, outgoings, installments, expenseList), forecast, reports,
    analytics: buildOverviewAnalytics(receipts, outgoings),
  };
}

function buildCashflow(receipts: Array<any>, outgoings: Array<any>, installments: Array<any>, expenseRows: Array<any>) {
  const periods = new Map<string, { period: string; actualIn: number; actualOut: number; forecastIn: number; forecastOut: number }>();
  const bucket = (date: Date | string | null | undefined) => {
    const d = date ? new Date(date) : new Date(); const key = d.toISOString().slice(0, 7);
    if (!periods.has(key)) periods.set(key, { period: key, actualIn: 0, actualOut: 0, forecastIn: 0, forecastOut: 0 });
    return periods.get(key)!;
  };
  receipts.forEach((row) => bucket(row.paymentDate).actualIn += n(row.amount));
  outgoings.forEach((row) => bucket(row.paymentDate).actualOut += n(row.amount));
  installments.forEach((row) => bucket(row.dueDate).forecastIn += Math.max(0, n(row.amount) - n(row.paidAmount)));
  expenseRows.filter((row) => row.remainingAmount > 0).forEach((row) => bucket(row.dueDate || row.expenseDate).forecastOut += row.remainingAmount);
  return [...periods.values()].sort((a, b) => a.period.localeCompare(b.period)).slice(-12);
}

export async function recordAtelierReceipt(actor: EmployeeContext, input: Record<string, unknown>) {
  const sourceType = String(input.sourceType || ""), sourceId = String(input.sourceId || ""), accountId = String(input.accountId || "");
  assertUuid(sourceId); assertUuid(accountId);
  const amount = Number(decimal(input.amount, "مبلغ دریافت", 2, true));
  const paidAt = input.paidAt ? new Date(String(input.paidAt)) : new Date();
  if (Number.isNaN(paidAt.getTime())) throw new ApiError(400, "تاریخ دریافت نامعتبر است.");
  const key = String(input.idempotencyKey || crypto.randomUUID());
  if (sourceType === "contract") {
    const [contract] = await db.select({ contract: studioContracts, coreProjectId: studioProjects.projectId }).from(studioContracts).innerJoin(studioProjects, eq(studioProjects.id, studioContracts.studioProjectId)).where(eq(studioContracts.id, sourceId)).limit(1);
    if (!contract || contract.contract.status !== "signed") throw new ApiError(404, "قرارداد تأییدشده یافت نشد.");
    await assertFinanceScope(actor, contract.coreProjectId);
    return createStudioPayment(contract.contract.studioProjectId, { amount, accountId, invoiceId: contract.contract.invoiceId, paidAt, paymentMethod: String(input.paymentMethod || "card_transfer") as any, referenceCode: String(input.referenceNumber || "") || undefined, notes: String(input.notes || "") || undefined, paymentType: String(input.paymentType || "installment_1") as any, idempotencyKey: key, actorId: actor.employeeId, authorName: actor.employeeName });
  }
  const table = sourceType === "daily_visit" ? studioDailyVisits : sourceType === "reservation" ? studioReservations : null;
  if (!table) throw new ApiError(400, "منبع دریافت نامعتبر است.");
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(table).where(eq(table.id, sourceId)).for("update").limit(1);
    if (!row?.invoiceId || !row.customerId) throw new ApiError(422, "اتصال مالی رکورد کامل نیست.");
    const payment = await postCanonicalReceipt(tx, { requestKey: `atelier-${sourceType}-receipt:${key}`, requestHash: hash({ sourceType, sourceId, amount, accountId, paidAt: paidAt.toISOString() }), customerId: row.customerId, invoiceId: row.invoiceId, accountId, amount, paymentDate: paidAt, paymentMethod: String(input.paymentMethod || "card_transfer"), referenceNumber: String(input.referenceNumber || "") || null, notes: String(input.notes || "") || null }, { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName });
    const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, row.invoiceId)).limit(1);
    await tx.update(table).set({ paidAmount: invoice!.paidAmount, updatedAt: new Date() }).where(eq(table.id, sourceId));
    return payment;
  });
}

export async function saveContractInstallments(actor: EmployeeContext, contractId: string, rows: Array<Record<string, unknown>>) {
  assertUuid(contractId);
  return db.transaction(async (tx) => {
    const [lockedContract] = await tx.select().from(studioContracts).where(eq(studioContracts.id, contractId)).for("update").limit(1);
    if (!lockedContract || lockedContract.status !== "signed") throw new ApiError(404, "قرارداد تأییدشده یافت نشد.");
    const [project] = await tx.select({ coreProjectId: studioProjects.projectId }).from(studioProjects).where(eq(studioProjects.id, lockedContract.studioProjectId)).limit(1);
    const [invoice] = lockedContract.invoiceId ? await tx.select({ balance: invoices.balanceDue, total: invoices.grandTotal }).from(invoices).where(eq(invoices.id, lockedContract.invoiceId)).limit(1) : [];
    await assertFinanceScope(actor, project?.coreProjectId);
    const current = await tx.select().from(studioInstallments).where(eq(studioInstallments.contractId, contractId));
    const allocations = current.length ? await tx.select().from(studioInstallmentAllocations).where(inArray(studioInstallmentAllocations.installmentId, current.map((r) => r.id))) : [];
    const values = rows.map((row, position) => ({ id: row.id ? String(row.id) : null, contractId, title: String(row.title || `قسط ${position + 1}`).trim(), amount: decimal(row.amount, "مبلغ قسط", 2, true), dueDate: new Date(String(row.dueDate)), position }));
    if (values.some((row) => Number.isNaN(row.dueDate.getTime()))) throw new ApiError(400, "تاریخ سررسید قسط نامعتبر است.");
    const total = values.reduce((sum, row) => sum + n(row.amount), 0);
    if (total > n(invoice?.total || lockedContract.totalAmount)) throw new ApiError(422, "جمع اقساط از مبلغ نهایی قرارداد بیشتر است.");
    const currentById = new Map(current.map((row) => [row.id, row]));
    const submittedIds = new Set<string>();
    const result = [];
    for (const value of values) {
      if (value.id) {
        assertUuid(value.id); const existing = currentById.get(value.id);
        if (!existing) throw new ApiError(422, "یکی از اقساط متعلق به این قرارداد نیست.");
        if (submittedIds.has(value.id)) throw new ApiError(422, "قسط تکراری در برنامه ارسال شده است.");
        submittedIds.add(value.id);
        const paid = allocations.filter((row) => row.installmentId === value.id).reduce((sum, row) => sum + n(row.amount), 0);
        if (n(value.amount) < paid) throw new ApiError(422, `مبلغ «${value.title}» از دریافتی ثبت‌شده آن کمتر است.`);
        const [updated] = await tx.update(studioInstallments).set({ title: value.title, amount: value.amount, dueDate: value.dueDate, position: value.position, updatedAt: new Date() }).where(eq(studioInstallments.id, value.id)).returning();
        result.push(updated);
      } else {
        const [created] = await tx.insert(studioInstallments).values({ contractId, title: value.title, amount: value.amount, dueDate: value.dueDate, position: value.position }).returning();
        result.push(created);
      }
    }
    for (const existing of current) if (!submittedIds.has(existing.id)) {
      if (allocations.some((row) => row.installmentId === existing.id)) throw new ApiError(409, `قسط «${existing.title}» دریافت دارد و قابل حذف نیست.`);
      await tx.delete(studioInstallments).where(eq(studioInstallments.id, existing.id));
    }
    await logAuditEvent("ATELIER_INSTALLMENTS_UPDATED", "studio_contract", contractId, { count: result.length, total }, { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName }, tx);
    return result;
  });
}

export async function updateContractFinance(actor: EmployeeContext, contractId: string, input: Record<string, unknown>) {
  assertUuid(contractId);
  return db.transaction(async (tx) => {
    const [contract] = await tx.select().from(studioContracts).where(eq(studioContracts.id, contractId)).for("update").limit(1);
    if (!contract || contract.status !== "signed" || !contract.invoiceId) throw new ApiError(404, "پرونده مالی قرارداد یافت نشد.");
    const [project] = await tx.select({ coreProjectId: studioProjects.projectId }).from(studioProjects).where(eq(studioProjects.id, contract.studioProjectId)).limit(1);
    await assertFinanceScope(actor, project?.coreProjectId);
    const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, contract.invoiceId)).for("update").limit(1);
    if (!invoice) throw new ApiError(422, "فاکتور قرارداد یافت نشد.");
    const items = await tx.select().from(studioContractItems).where(eq(studioContractItems.contractId, contractId));
    const subtotal = items.reduce((sum, row) => sum + n(row.quantity) * n(row.unitPrice), 0);
    const discount = Number(decimal(input.discountAmount ?? contract.discountAmount, "تخفیف ثابت", 2));
    if (discount < 0 || discount > subtotal) throw new ApiError(422, "تخفیف ثابت باید بین صفر و جمع آیتم‌های قرارداد باشد.");
    const finalAmount = subtotal - discount;
    const paidAmount = n(invoice.paidAmount);
    if (paidAmount > finalAmount) throw new ApiError(422, "مبلغ دریافت‌شده از مبلغ نهایی جدید بیشتر می‌شود؛ ابتدا اصلاح یا برگشت دریافت را ثبت کنید.");
    const installments = await tx.select().from(studioInstallments).where(eq(studioInstallments.contractId, contractId));
    const installmentTotal = installments.reduce((sum, row) => sum + n(row.amount), 0);
    if (installmentTotal > finalAmount) throw new ApiError(422, "جمع اقساط از مبلغ نهایی جدید بیشتر است؛ ابتدا برنامه اقساط را اصلاح کنید.");
    const balanceDue = finalAmount - paidAmount;
    const financialNotes = String(input.financialNotes ?? contract.financialNotes ?? "").trim() || null;
    await tx.update(studioContracts).set({ discountAmount: discount.toFixed(2), totalAmount: finalAmount.toFixed(2), financialNotes, updatedAt: new Date() }).where(eq(studioContracts.id, contractId));
    await tx.update(invoices).set({ subtotal: subtotal.toFixed(2), invoiceDiscount: discount.toFixed(2), grandTotal: finalAmount.toFixed(2), balanceDue: balanceDue.toFixed(2), paymentStatus: balanceDue === 0 ? "paid" : paidAmount > 0 ? "partial" : "unpaid", settlementDate: balanceDue === 0 ? invoice.settlementDate || new Date() : null, notes: financialNotes, updatedAt: new Date() }).where(eq(invoices.id, invoice.id));
    await logAuditEvent("ATELIER_CONTRACT_FINANCE_UPDATED", "studio_contract", contractId, { before: { discountAmount: contract.discountAmount, totalAmount: contract.totalAmount, financialNotes: contract.financialNotes }, after: { discountAmount: discount, totalAmount: finalAmount, financialNotes }, paidAmount, balanceDue }, { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName }, tx);
    return { subtotal, discountAmount: discount, finalAmount, paidAmount, balanceDue, financialNotes };
  });
}

export async function payAtelierInstallment(actor: EmployeeContext, installmentId: string, input: Record<string, unknown>) {
  assertUuid(installmentId);
  const [record] = await db.select({ installment: studioInstallments, contract: studioContracts, coreProjectId: studioProjects.projectId }).from(studioInstallments).innerJoin(studioContracts, eq(studioContracts.id, studioInstallments.contractId)).innerJoin(studioProjects, eq(studioProjects.id, studioContracts.studioProjectId)).where(eq(studioInstallments.id, installmentId)).limit(1);
  if (!record || !record.contract.invoiceId) throw new ApiError(404, "قسط قرارداد یافت نشد.");
  await assertFinanceScope(actor, record.coreProjectId);
  return createStudioPayment(record.contract.studioProjectId, {
    amount: input.amount as number | string, accountId: String(input.accountId || ""), invoiceId: record.contract.invoiceId,
    targetInstallmentId: installmentId, paidAt: input.paidAt ? new Date(String(input.paidAt)) : new Date(),
    paymentMethod: String(input.paymentMethod || "card_transfer") as any, notes: String(input.notes || "") || undefined,
    referenceCode: String(input.referenceNumber || "") || undefined, paymentType: "installment_1",
    idempotencyKey: String(input.idempotencyKey || crypto.randomUUID()), actorId: actor.employeeId, authorName: actor.employeeName,
  });
}

export async function adjustAtelierAccountBalance(actor: EmployeeContext, accountId: string, input: Record<string, unknown>) {
  assertUuid(accountId);
  const newBalance = Number(decimal(input.newBalance, "موجودی جدید", 2));
  if (newBalance < 0) throw new ApiError(422, "موجودی جدید نمی‌تواند منفی باشد.");
  const reason = String(input.reason || "").trim();
  if (reason.length < 5) throw new ApiError(400, "دلیل اصلاح موجودی را کامل وارد کنید.");
  const adjustedAt = input.adjustedAt ? new Date(String(input.adjustedAt)) : new Date();
  if (Number.isNaN(adjustedAt.getTime())) throw new ApiError(400, "تاریخ اصلاح نامعتبر است.");
  const idempotencyKey = String(input.idempotencyKey || crypto.randomUUID());
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`account-adjustment:${idempotencyKey}`}, 0))`);
    const [prior] = await tx.select().from(accountBalanceAdjustments).where(eq(accountBalanceAdjustments.idempotencyKey, idempotencyKey)).limit(1);
    if (prior) return prior;
    const [account] = await tx.select().from(accounts).where(and(eq(accounts.id, accountId), eq(accounts.status, "active"))).for("update").limit(1);
    if (!account) throw new ApiError(404, "حساب فعال یافت نشد.");
    const oldBalance = n(account.balance), delta = newBalance - oldBalance;
    if (delta === 0) throw new ApiError(422, "موجودی جدید با موجودی فعلی برابر است.");
    const [adjustment] = await tx.insert(accountBalanceAdjustments).values({ accountId, oldBalance: oldBalance.toFixed(2), newBalance: newBalance.toFixed(2), delta: delta.toFixed(2), reason, adjustedAt, createdById: actor.employeeId, idempotencyKey }).returning();
    await tx.update(accounts).set({ balance: newBalance.toFixed(2) }).where(eq(accounts.id, accountId));
    await logAuditEvent("ATELIER_ACCOUNT_BALANCE_ADJUSTED", "account", accountId, { adjustmentId: adjustment.id, oldBalance, newBalance, delta, reason, adjustedAt }, { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName }, tx);
    return adjustment;
  });
}

export async function createAtelierExpense(actor: EmployeeContext, input: Record<string, unknown>) {
  const studioProjectId = input.studioProjectId ? String(input.studioProjectId) : null;
  if (studioProjectId) {
    const [project] = await db.select({ coreProjectId: studioProjects.projectId }).from(studioProjects).where(eq(studioProjects.id, studioProjectId)).limit(1);
    if (!project) throw new ApiError(404, "پروژه مالی یافت نشد.");
    await assertFinanceScope(actor, project.coreProjectId);
    return createStudioExpense(studioProjectId, { title: String(input.title || ""), expenseCategory: String(input.category || "misc") as any, amount: input.amount as any, recipientName: String(input.recipientName || "") || undefined, paymentStatus: input.paid ? "paid" : "pending", accountId: input.accountId ? String(input.accountId) : undefined, paidAt: input.expenseDate ? new Date(String(input.expenseDate)) : new Date(), notes: String(input.notes || "") || undefined, idempotencyKey: String(input.idempotencyKey || crypto.randomUUID()), actorId: actor.employeeId, authorName: actor.employeeName });
  }
  return db.transaction((tx) => postCanonicalExpense(tx, { requestKey: `atelier-general-expense:${String(input.idempotencyKey || crypto.randomUUID())}`, requestHash: hash(input), title: String(input.title || ""), category: String(input.category || "general"), amount: input.amount as any, accountId: input.accountId ? String(input.accountId) : null, expenseDate: input.expenseDate ? new Date(String(input.expenseDate)) : new Date(), dueDate: input.dueDate ? new Date(String(input.dueDate)) : null, description: String(input.notes || "") || null, paid: Boolean(input.paid) }, { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName }));
}

export async function settleAtelierExpense(actor: EmployeeContext, expenseId: string, input: Record<string, unknown>) {
  assertUuid(expenseId);
  const [expense] = await db.select({ projectId: expenses.projectId }).from(expenses).where(eq(expenses.id, expenseId)).limit(1);
  if (!expense) throw new ApiError(404, "هزینه یافت نشد.");
  await assertFinanceScope(actor, expense.projectId);
  return db.transaction((tx) => postCanonicalExpensePayment(tx, { requestKey: `atelier-expense-payment:${String(input.idempotencyKey || crypto.randomUUID())}`, requestHash: hash({ expenseId, ...input }), expenseId, accountId: String(input.accountId || ""), amount: input.amount as any, paymentDate: input.paymentDate ? new Date(String(input.paymentDate)) : new Date(), paymentMethod: String(input.paymentMethod || "bank_transfer"), referenceNumber: String(input.referenceNumber || "") || null, notes: String(input.notes || "") || null }, { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName }));
}

export async function settleAtelierObligation(actor: EmployeeContext, sourceType: "personnel_wage" | "rental", sourceId: string, input: Record<string, unknown>) {
  assertUuid(sourceId);
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`atelier-obligation:${sourceType}:${sourceId}`}, 0))`);
    let [link] = await tx.select().from(atelierExpenseSources).where(and(eq(atelierExpenseSources.sourceType, sourceType), eq(atelierExpenseSources.sourceId, sourceId))).limit(1);
    let total = 0, projectId: string | null = null, title = "", paymentType: "salary_payout" | "supplier_payment" = "supplier_payment";
    if (sourceType === "personnel_wage") {
      const [salary] = await tx.select().from(personnelSalaryRecords).where(eq(personnelSalaryRecords.id, sourceId)).for("update").limit(1);
      if (!salary) throw new ApiError(404, "دستمزد یافت نشد.");
      const [person] = await tx.select({ name: studioPersonnel.fullName }).from(studioPersonnel).where(eq(studioPersonnel.id, salary.personnelId)).limit(1);
      const [project] = salary.studioProjectId ? await tx.select({ coreProjectId: studioProjects.projectId }).from(studioProjects).where(eq(studioProjects.id, salary.studioProjectId)).limit(1) : [];
      total = n(salary.totalCalculated); projectId = project?.coreProjectId || null; title = `دستمزد ${person?.name || "پرسنل"}`; paymentType = "salary_payout";
    } else {
      const [rental] = await tx.select().from(rentalEquipment).where(eq(rentalEquipment.id, sourceId)).for("update").limit(1);
      if (!rental) throw new ApiError(404, "اجاره تجهیزات یافت نشد.");
      const [project] = rental.studioProjectId ? await tx.select({ coreProjectId: studioProjects.projectId }).from(studioProjects).where(eq(studioProjects.id, rental.studioProjectId)).limit(1) : [];
      total = n(rental.rentalCost); projectId = project?.coreProjectId || null; title = `اجاره ${rental.itemTitle}`;
    }
    await assertFinanceScope(actor, projectId);
    if (!link) {
      const canonical = await postCanonicalExpense(tx, { requestKey: `atelier-obligation-expense:${sourceType}:${sourceId}`, requestHash: hash({ sourceType, sourceId, total }), projectId, title, category: sourceType === "personnel_wage" ? "salary" : "rental", amount: total, expenseDate: new Date(), dueDate: input.dueDate ? new Date(String(input.dueDate)) : null, paid: false, sourceType, sourceId }, { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName });
      [link] = await tx.select().from(atelierExpenseSources).where(eq(atelierExpenseSources.expenseId, canonical.expense.id)).limit(1);
    }
    const payment = await postCanonicalExpensePayment(tx, { requestKey: `atelier-obligation-payment:${String(input.idempotencyKey || crypto.randomUUID())}`, requestHash: hash({ sourceType, sourceId, ...input }), expenseId: link.expenseId, accountId: String(input.accountId || ""), amount: input.amount as any, paymentDate: input.paymentDate ? new Date(String(input.paymentDate)) : new Date(), paymentMethod: String(input.paymentMethod || "bank_transfer"), paymentType }, { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName });
    const [expense] = await tx.select().from(expenses).where(eq(expenses.id, link.expenseId)).limit(1);
    if (sourceType === "personnel_wage") await tx.update(personnelSalaryRecords).set({ paymentStatus: expense?.paymentStatus === "paid" ? "paid" : "partial", paymentId: payment.id, accountId: String(input.accountId), financialStatus: "posted", settlementDate: expense?.paymentStatus === "paid" ? new Date() : null, updatedAt: new Date() }).where(eq(personnelSalaryRecords.id, sourceId));
    else await tx.update(rentalEquipment).set({ expenseId: link.expenseId, paymentId: payment.id, accountId: String(input.accountId), financialStatus: "posted", status: expense?.paymentStatus === "paid" ? "settled" : "rented", updatedAt: new Date() }).where(eq(rentalEquipment.id, sourceId));
    return { payment, expense };
  });
}
