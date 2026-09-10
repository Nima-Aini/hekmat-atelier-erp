import { db } from "@/db";
import { personnelSalaryRecords, rentalEquipment, studioContracts, studioProjectExpenses, studioProjectPayments, studioProjects } from "@/db/schema";
import { and, eq, isNotNull, isNull } from "drizzle-orm";

export interface ReconciliationRow {
  recordType: string;
  studioRecordId: string;
  project: string;
  amount: number;
  date: Date | null;
  currentLinkage: string;
  recommendedAction: string;
}

export async function getStudioReconciliationReport(allowedCoreProjectIds: string[] | null = null) {
  const [projectRows, contracts, payments, expenses, salaries, rentals] = await Promise.all([
    db.select().from(studioProjects),
    db.select().from(studioContracts).where(isNull(studioContracts.invoiceId)),
    db.select().from(studioProjectPayments).where(isNull(studioProjectPayments.paymentId)),
    db.select().from(studioProjectExpenses).where(isNull(studioProjectExpenses.expenseId)),
    db.select().from(personnelSalaryRecords).where(and(eq(personnelSalaryRecords.paymentStatus, "paid"), isNull(personnelSalaryRecords.paymentId))),
    db.select().from(rentalEquipment).where(and(isNotNull(rentalEquipment.studioProjectId), isNull(rentalEquipment.expenseId))),
  ]);
  const projectMap = new Map(projectRows.map((p) => [p.id, p]));
  const allowed = (studioProjectId: string | null) => {
    if (allowedCoreProjectIds === null) return true;
    if (!studioProjectId) return false;
    const coreId = projectMap.get(studioProjectId)?.projectId;
    return Boolean(coreId && allowedCoreProjectIds.includes(coreId));
  };
  const rows: ReconciliationRow[] = [];
  for (const project of projectRows) if (!project.projectId && allowedCoreProjectIds === null) rows.push({ recordType: "studio_project", studioRecordId: project.id, project: project.title, amount: Number(project.totalContractValue), date: project.createdAt, currentLinkage: "core project: none", recommendedAction: "Review and manually attach or create the correct ERP project; do not post history automatically." });
  for (const row of contracts) if (!row.invoiceId && allowed(row.studioProjectId)) rows.push({ recordType: "studio_contract", studioRecordId: row.id, project: projectMap.get(row.studioProjectId)?.title || row.studioProjectId, amount: Number(row.totalAmount), date: row.contractDate, currentLinkage: "invoice: none", recommendedAction: "Review contract and issue/link an ERP invoice manually." });
  for (const row of payments) if (!row.paymentId && allowed(row.studioProjectId)) rows.push({ recordType: "studio_payment", studioRecordId: row.id, project: projectMap.get(row.studioProjectId)?.title || row.studioProjectId, amount: Number(row.amount), date: row.paidAt, currentLinkage: "payment: none", recommendedAction: "Verify bank evidence and manually reconcile to an ERP payment." });
  for (const row of expenses) if (!row.expenseId && allowed(row.studioProjectId)) rows.push({ recordType: "studio_expense", studioRecordId: row.id, project: projectMap.get(row.studioProjectId)?.title || row.studioProjectId, amount: Number(row.amount), date: row.paidAt, currentLinkage: "expense: none", recommendedAction: "Verify receipt/account and manually reconcile to an ERP expense." });
  for (const row of salaries) if (row.paymentStatus === "paid" && !row.paymentId && allowed(row.studioProjectId)) rows.push({ recordType: "studio_wage", studioRecordId: row.id, project: row.studioProjectId ? projectMap.get(row.studioProjectId)?.title || row.studioProjectId : "عمومی", amount: Number(row.totalCalculated), date: row.settlementDate || row.createdAt, currentLinkage: "payment: none", recommendedAction: "Verify settlement evidence before manually creating/linking payroll payment." });
  for (const row of rentals) if (row.studioProjectId && !row.expenseId && allowed(row.studioProjectId)) rows.push({ recordType: "studio_rental", studioRecordId: row.id, project: projectMap.get(row.studioProjectId)?.title || row.studioProjectId, amount: Number(row.rentalCost), date: row.pickupDate, currentLinkage: "expense: none", recommendedAction: "Verify supplier/account and manually reconcile to an ERP expense." });
  const counts = rows.reduce<Record<string, number>>((acc, row) => { acc[row.recordType] = (acc[row.recordType] || 0) + 1; return acc; }, {});
  return { mode: "dry-run" as const, readOnly: true, counts, total: rows.length, rows };
}
