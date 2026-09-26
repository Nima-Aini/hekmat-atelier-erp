import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { accounts, atelierExpenseSources, customers, expensePaymentAllocations, expenses, payments, personnelSalaryRecords, studioContractItems, studioContracts, studioCustomers, studioDailyVisitPersonnel, studioDailyVisits, studioPersonnel, studioPlanningPersonnel, studioProjects } from "@/db/schema";
import { ApiError, assertUuid } from "@/lib/apiError";

export async function getPersonnelFinancialFile(personnelId: string, from?: Date, to?: Date) {
  assertUuid(personnelId);
  const [person] = await db.select().from(studioPersonnel).where(eq(studioPersonnel.id, personnelId)).limit(1);
  if (!person) throw new ApiError(404, "پرسنل یافت نشد.");
  const salaryRows = await db.select().from(personnelSalaryRecords).where(eq(personnelSalaryRecords.personnelId, personnelId)).orderBy(asc(personnelSalaryRecords.createdAt));
  const activeSalaries = salaryRows.filter((row) => row.financialStatus !== "voided");
  const salaryIds = activeSalaries.map((row) => row.id);
  const [contractWork, visitWork, links] = salaryIds.length ? await Promise.all([
    db.select({ salaryRecordId: studioPlanningPersonnel.salaryRecordId, assignment: studioPlanningPersonnel, item: studioContractItems, contract: studioContracts, project: studioProjects, customerName: customers.name })
      .from(studioPlanningPersonnel).innerJoin(studioContractItems, eq(studioContractItems.id, studioPlanningPersonnel.contractItemId)).innerJoin(studioContracts, eq(studioContracts.id, studioContractItems.contractId)).innerJoin(studioProjects, eq(studioProjects.id, studioContracts.studioProjectId)).innerJoin(studioCustomers, eq(studioCustomers.id, studioProjects.studioCustomerId)).innerJoin(customers, eq(customers.id, studioCustomers.customerId)).where(inArray(studioPlanningPersonnel.salaryRecordId, salaryIds)),
    db.select({ salaryRecordId: studioDailyVisitPersonnel.salaryRecordId, assignment: studioDailyVisitPersonnel, visit: studioDailyVisits }).from(studioDailyVisitPersonnel).innerJoin(studioDailyVisits, eq(studioDailyVisits.id, studioDailyVisitPersonnel.dailyVisitId)).where(inArray(studioDailyVisitPersonnel.salaryRecordId, salaryIds)),
    db.select().from(atelierExpenseSources).where(and(eq(atelierExpenseSources.sourceType, "personnel_wage"), inArray(atelierExpenseSources.sourceId, salaryIds))),
  ]) : [[], [], []];
  const expenseIds = links.map((row) => row.expenseId);
  const [expenseRows, allocationRows] = expenseIds.length ? await Promise.all([
    db.select().from(expenses).where(inArray(expenses.id, expenseIds)),
    db.select({ allocation: expensePaymentAllocations, payment: payments, accountName: accounts.name }).from(expensePaymentAllocations).innerJoin(payments, eq(payments.id, expensePaymentAllocations.paymentId)).innerJoin(accounts, eq(accounts.id, payments.accountId)).where(inArray(expensePaymentAllocations.expenseId, expenseIds)).orderBy(asc(payments.paymentDate)),
  ]) : [[], []];
  const linkBySalary = new Map(links.map((row) => [row.sourceId, row.expenseId]));
  const expenseById = new Map(expenseRows.map((row) => [row.id, row]));
  const inRange = (date: Date) => (!from || date >= from) && (!to || date <= to);
  const history = activeSalaries.map((salary) => {
    const contract = contractWork.find((row) => row.salaryRecordId === salary.id);
    const visit = visitWork.find((row) => row.salaryRecordId === salary.id);
    const date = new Date(contract?.contract.programDate || visit?.visit.visitDate || salary.createdAt);
    const expense = expenseById.get(linkBySalary.get(salary.id) || "");
    const wage = Number(salary.totalCalculated);
    const paid = Number(expense?.paidAmount || 0);
    return {
      salaryRecordId: salary.id,
      sourceType: contract ? "contract" : visit ? "daily_visit" : "other",
      sourceId: contract?.contract.id || visit?.visit.id || null,
      sourceTitle: contract ? `${contract.contract.contractNumber} — ${contract.customerName}` : visit ? visit.visit.title : "سایر کارکرد",
      workTitle: contract?.item.title || visit?.assignment.workTitle || salary.notes || "کارکرد",
      date,
      wage,
      paid,
      remaining: Math.max(0, wage - paid),
      expenseId: expense?.id || null,
    };
  }).filter((row) => inRange(row.date));
  const includedExpenseIds = new Set(history.map((row) => row.expenseId).filter(Boolean));
  const paymentHistory = allocationRows.filter(({ allocation }) => includedExpenseIds.has(allocation.expenseId)).map(({ allocation, payment, accountName }) => {
    const work = history.find((row) => row.expenseId === allocation.expenseId);
    return { id: payment.id, date: payment.paymentDate, amount: Number(allocation.allocatedAmount), accountName, paymentMethod: payment.paymentMethod, relatedWork: work?.sourceTitle || "کارکرد پرسنل", notes: payment.notes };
  });
  return {
    personnel: person,
    totals: {
      earned: history.reduce((sum, row) => sum + row.wage, 0),
      paid: history.reduce((sum, row) => sum + row.paid, 0),
      remaining: history.reduce((sum, row) => sum + row.remaining, 0),
      contracts: new Set(history.filter((row) => row.sourceType === "contract").map((row) => row.sourceId)).size,
      dailyVisits: new Set(history.filter((row) => row.sourceType === "daily_visit").map((row) => row.sourceId)).size,
    },
    history,
    paymentHistory,
  };
}
