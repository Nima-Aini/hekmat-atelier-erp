import { db } from "@/db";
import { equipmentReservations, expenses, invoices, payments, personnelSalaryRecords, studioCatalog, studioEquipment, studioLeads, studioPersonnel, studioProjects, studioTasks } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { gregorianToJalali } from "@/lib/dateUtils";

const group = (values: string[]) => Object.fromEntries([...new Set(values)].map(key => [key, values.filter(value => value === key).length]));
const monthKey = (value: Date) => { const date = gregorianToJalali(value); return `${date.year}/${String(date.month).padStart(2, "0")}`; };

export async function getAtelierReports(coreIds: string[] | null, actorId: string, unscoped: boolean, access: { finance: boolean; wages: boolean } = { finance: true, wages: true }) {
  const projectCondition = coreIds === null ? undefined : coreIds.length ? inArray(studioProjects.projectId, coreIds) : sql`false`;
  const projects = await db.select().from(studioProjects).where(projectCondition);
  const coreProjectIds = projects.map(project => project.projectId).filter(Boolean) as string[];
  const studioProjectIds = projects.map(project => project.id);
  const [invoiceRows, receiptRows, costRows, wageRows, reservationRows, catalogRows, leadRows, taskRows] = await Promise.all([
    access.finance && coreProjectIds.length ? db.select().from(invoices).where(and(inArray(invoices.projectId, coreProjectIds), eq(invoices.status, "issued"))) : [],
    access.finance && coreProjectIds.length ? db.select().from(payments).where(and(inArray(payments.projectId, coreProjectIds), eq(payments.status, "completed"), eq(payments.paymentType, "customer_receipt"))) : [],
    access.finance && coreProjectIds.length ? db.select().from(expenses).where(and(inArray(expenses.projectId, coreProjectIds), eq(expenses.status, "posted"))) : [],
    access.wages && studioProjectIds.length ? db.select({ projectId: personnelSalaryRecords.studioProjectId, personnelId: personnelSalaryRecords.personnelId, name: studioPersonnel.fullName, total: personnelSalaryRecords.totalCalculated, status: personnelSalaryRecords.paymentStatus }).from(personnelSalaryRecords).innerJoin(studioPersonnel, eq(studioPersonnel.id, personnelSalaryRecords.personnelId)).where(inArray(personnelSalaryRecords.studioProjectId, studioProjectIds)) : [],
    studioProjectIds.length ? db.select({ projectId: equipmentReservations.studioProjectId, equipmentId: equipmentReservations.equipmentId, title: studioEquipment.title, status: equipmentReservations.status }).from(equipmentReservations).innerJoin(studioEquipment, eq(studioEquipment.id, equipmentReservations.equipmentId)).where(inArray(equipmentReservations.studioProjectId, studioProjectIds)) : [],
    db.select().from(studioCatalog),
    db.select().from(studioLeads).where(unscoped ? undefined : eq(studioLeads.assignedEmployeeId, actorId)),
    studioProjectIds.length ? db.select({ projectId: studioTasks.studioProjectId, personnelId: studioTasks.assignedPersonnelId, status: studioTasks.status, dueDate: studioTasks.dueDate }).from(studioTasks).where(inArray(studioTasks.studioProjectId, studioProjectIds)) : [],
  ]);
  const byProject = <T extends { projectId: string | null }>(id: string | null, rows: T[]) => rows.filter(row => row.projectId === id);
  const profitability = projects.map(project => {
    const projectInvoices = byProject(project.projectId, invoiceRows);
    const projectReceipts = byProject(project.projectId, receiptRows);
    const projectCosts = byProject(project.projectId, costRows);
    const revenue = projectInvoices.reduce((sum, row) => sum + Number(row.grandTotal), 0);
    const collected = projectReceipts.reduce((sum, row) => sum + Number(row.amount), 0);
    const cost = projectCosts.reduce((sum, row) => sum + Number(row.amount), 0);
    return { id: project.id, catalogItemId: project.catalogItemId, title: project.title, eventType: project.eventType, revenue, collected, outstanding: projectInvoices.reduce((sum, row) => sum + Number(row.balanceDue), 0), cost, profit: revenue - cost };
  }).sort((a, b) => b.profit - a.profit);

  const personnelMap: Record<string, { id: string; name: string; projects: Set<string | null>; wages: number; outstanding: number; tasks: number; completedTasks: number }> = {};
  for (const wage of wageRows) {
    const row = personnelMap[wage.personnelId] || { id: wage.personnelId, name: wage.name, projects: new Set(), wages: 0, outstanding: 0, tasks: 0, completedTasks: 0 };
    row.projects.add(wage.projectId); row.wages += Number(wage.total); if (wage.status !== "paid") row.outstanding += Number(wage.total); personnelMap[wage.personnelId] = row;
  }
  for (const task of taskRows) if (task.personnelId) {
    const row = personnelMap[task.personnelId] || { id: task.personnelId, name: "عضو تیم", projects: new Set(), wages: 0, outstanding: 0, tasks: 0, completedTasks: 0 };
    row.projects.add(task.projectId); row.tasks += 1; if (task.status === "done") row.completedTasks += 1; personnelMap[task.personnelId] = row;
  }
  const personnel = Object.values(personnelMap).map(row => ({ ...row, projects: row.projects.size, wages: access.wages ? row.wages : null, outstanding: access.wages ? row.outstanding : null }));

  const equipmentMap: Record<string, { id: string; title: string; reservations: number; checkedOut: number; damaged: number }> = {};
  for (const reservation of reservationRows) {
    const row = equipmentMap[reservation.equipmentId] || { id: reservation.equipmentId, title: reservation.title, reservations: 0, checkedOut: 0, damaged: 0 };
    row.reservations += 1; if (reservation.status === "checked_out") row.checkedOut += 1; if (reservation.status === "damaged") row.damaged += 1; equipmentMap[reservation.equipmentId] = row;
  }

  const services = catalogRows.filter(item => item.active).map(item => {
    const jobs = profitability.filter(project => project.catalogItemId === item.id);
    return { id: item.id, name: item.name, kind: item.kind, bookings: jobs.length, revenue: jobs.reduce((sum, job) => sum + job.revenue, 0), profit: jobs.reduce((sum, job) => sum + job.profit, 0), averageTicket: jobs.length ? jobs.reduce((sum, job) => sum + job.revenue, 0) / jobs.length : 0 };
  }).sort((a, b) => b.bookings - a.bookings);

  const cashflow: Record<string, { month: string; contracted: number; collected: number; expenses: number; net: number }> = {};
  const cashRow = (date: Date) => cashflow[monthKey(date)] ||= { month: monthKey(date), contracted: 0, collected: 0, expenses: 0, net: 0 };
  invoiceRows.forEach(row => { cashRow(row.invoiceDate).contracted += Number(row.grandTotal); });
  receiptRows.forEach(row => { cashRow(row.paymentDate).collected += Number(row.amount); });
  costRows.forEach(row => { cashRow(row.expenseDate).expenses += Number(row.amount); });
  Object.values(cashflow).forEach(row => { row.net = row.collected - row.expenses; });

  const now = new Date();
  const delayedIds = new Set(taskRows.filter(task => task.dueDate && task.dueDate < now && ["open", "in_progress"].includes(task.status)).map(task => task.projectId));
  const completedProjects = projects.filter(project => ["delivered", "completed", "archived"].includes(project.status));
  const turnaroundDays = completedProjects.map(project => Math.max(0, (project.updatedAt.getTime() - project.eventDate.getTime()) / 86_400_000));

  return {
    crm: { total: leadRows.length, bySource: group(leadRows.map(row => row.source || "نامشخص")), byStage: group(leadRows.map(row => row.stage)), lostReasons: group(leadRows.filter(row => row.stage === "lost").map(row => row.lostReason || "ثبت نشده")), conversionRate: leadRows.length ? Math.round(leadRows.filter(row => row.stage === "converted").length / leadRows.length * 1000) / 10 : 0 },
    projects: { total: projects.length, active: projects.filter(project => !["delivered", "completed", "archived", "cancelled"].includes(project.status)).length, completed: completedProjects.length, delayed: delayedIds.size, averageTurnaroundDays: turnaroundDays.length ? Math.round(turnaroundDays.reduce((sum, days) => sum + days, 0) / turnaroundDays.length * 10) / 10 : 0, byStage: group(projects.map(project => project.status)), byType: group(projects.map(project => project.eventType)) },
    finance: access.finance ? { contracted: profitability.reduce((sum, row) => sum + row.revenue, 0), collected: profitability.reduce((sum, row) => sum + row.collected, 0), outstanding: profitability.reduce((sum, row) => sum + row.outstanding, 0), cost: profitability.reduce((sum, row) => sum + row.cost, 0), profit: profitability.reduce((sum, row) => sum + row.profit, 0), profitability, cashflow: Object.values(cashflow).sort((a, b) => a.month.localeCompare(b.month)) } : null,
    personnel,
    equipment: { reservations: reservationRows.length, checkedOut: reservationRows.filter(row => row.status === "checked_out").length, damaged: reservationRows.filter(row => row.status === "damaged").length, utilization: Object.values(equipmentMap).sort((a, b) => b.reservations - a.reservations) },
    services: { items: catalogRows.filter(item => item.active).length, packages: catalogRows.filter(item => item.active && item.kind === "package").length, performance: services },
  };
}
