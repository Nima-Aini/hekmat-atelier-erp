import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  equipmentReservations, studioCalendarEvents, studioContracts, studioDeliverables,
  studioEquipment, studioInstallmentAllocations, studioInstallments, studioLeads,
  studioNotifications, studioProjects, studioTasks,
} from "@/db/schema";
import { and, asc, eq, gte, inArray, lt, ne, or, sql } from "drizzle-orm";
import { apiError } from "@/lib/apiError";
import { getScopedProjectIds, requirePermission } from "@/services/access";

export async function GET() {
  try {
    const actor = await requirePermission("studio.view");
    const ids = await getScopedProjectIds();
    const projectScope = ids === null ? undefined : ids.length ? inArray(studioProjects.projectId, ids) : sql`false`;
    const now = new Date();
    const tomorrowStart = new Date(now); tomorrowStart.setUTCHours(24, 0, 0, 0);
    const tomorrowEnd = new Date(tomorrowStart.getTime() + 86_400_000);
    const leadScope = actor.permissions.has("*") ? undefined : eq(studioLeads.assignedEmployeeId, actor.employeeId);
    const calendarScope = ids === null ? undefined : or(projectScope, eq(studioCalendarEvents.ownerEmployeeId, actor.employeeId));

    const [stored, tasks, returns, tomorrowEvents, unsigned, leads, deliverables, maintenance, installments] = await Promise.all([
      db.select({ id: studioNotifications.id, title: studioNotifications.notificationType, message: studioNotifications.messageText, status: studioNotifications.status, scheduledFor: studioNotifications.scheduledFor, projectTitle: studioProjects.title })
        .from(studioNotifications).leftJoin(studioProjects, eq(studioProjects.id, studioNotifications.studioProjectId)).where(projectScope).orderBy(asc(studioNotifications.scheduledFor)).limit(100),
      db.select({ id: studioTasks.id, title: studioTasks.title, dueDate: studioTasks.dueDate, projectTitle: studioProjects.title, stage: studioTasks.stage })
        .from(studioTasks).innerJoin(studioProjects, eq(studioProjects.id, studioTasks.studioProjectId)).where(and(projectScope, lt(studioTasks.dueDate, now), inArray(studioTasks.status, ["open", "in_progress"]))).limit(30),
      db.select({ id: equipmentReservations.id, title: studioEquipment.title, dueDate: equipmentReservations.reservedTo, projectTitle: studioProjects.title })
        .from(equipmentReservations).innerJoin(studioEquipment, eq(studioEquipment.id, equipmentReservations.equipmentId)).leftJoin(studioProjects, eq(studioProjects.id, equipmentReservations.studioProjectId)).where(and(projectScope, lt(equipmentReservations.reservedTo, now), eq(equipmentReservations.status, "checked_out"))).limit(30),
      db.select({ id: studioCalendarEvents.id, title: studioCalendarEvents.title, dueDate: studioCalendarEvents.startTime, projectTitle: studioProjects.title, eventType: studioCalendarEvents.eventType })
        .from(studioCalendarEvents).leftJoin(studioProjects, eq(studioProjects.id, studioCalendarEvents.studioProjectId)).where(and(calendarScope, gte(studioCalendarEvents.startTime, tomorrowStart), lt(studioCalendarEvents.startTime, tomorrowEnd), ne(studioCalendarEvents.status, "cancelled"))).limit(30),
      db.select({ id: studioContracts.id, contractNumber: studioContracts.contractNumber, projectTitle: studioProjects.title, dueDate: studioContracts.contractDate })
        .from(studioContracts).innerJoin(studioProjects, eq(studioProjects.id, studioContracts.studioProjectId)).where(and(projectScope, inArray(studioContracts.status, ["draft", "sent"]))).limit(30),
      db.select({ id: studioLeads.id, title: studioLeads.name, dueDate: studioLeads.nextFollowUp })
        .from(studioLeads).where(and(leadScope, lt(studioLeads.nextFollowUp, now), inArray(studioLeads.stage, ["lead", "contact", "consultation", "proposal", "contract_pending"]))).limit(30),
      db.select({ id: studioDeliverables.id, title: studioDeliverables.title, dueDate: studioDeliverables.dueDate, status: studioDeliverables.status, kind: studioDeliverables.kind, projectTitle: studioProjects.title })
        .from(studioDeliverables).innerJoin(studioProjects, eq(studioProjects.id, studioDeliverables.studioProjectId)).where(and(projectScope, or(and(lt(studioDeliverables.dueDate, now), inArray(studioDeliverables.status, ["pending", "in_progress"])), eq(studioDeliverables.status, "ready")))).limit(30),
      db.select({ id: studioEquipment.id, title: studioEquipment.title, status: studioEquipment.currentHealthStatus })
        .from(studioEquipment).where(or(eq(studioEquipment.currentHealthStatus, "needs_service"), eq(studioEquipment.currentHealthStatus, "damaged"))).limit(30),
      db.select({ id: studioInstallments.id, title: studioInstallments.title, dueDate: studioInstallments.dueDate, amount: studioInstallments.amount, paid: sql<string>`coalesce(sum(${studioInstallmentAllocations.amount}), 0)`, projectTitle: studioProjects.title })
        .from(studioInstallments).innerJoin(studioContracts, eq(studioContracts.id, studioInstallments.contractId)).innerJoin(studioProjects, eq(studioProjects.id, studioContracts.studioProjectId)).leftJoin(studioInstallmentAllocations, eq(studioInstallmentAllocations.installmentId, studioInstallments.id))
        .where(and(projectScope, lt(studioInstallments.dueDate, now))).groupBy(studioInstallments.id, studioProjects.title)
        .having(sql`coalesce(sum(${studioInstallmentAllocations.amount}), 0) < ${studioInstallments.amount}`).limit(30),
    ]);

    const manual = (row: Record<string, unknown>, title: string, message: string) => ({ ...row, title, message, status: "manual" });
    return NextResponse.json({ success: true, notifications: [
      ...tasks.map(row => manual(row, `${row.stage}_overdue`, `کار «${row.title}» عقب‌افتاده است.`)),
      ...deliverables.map(row => manual(row, row.status === "ready" ? "delivery_ready" : `${row.kind}_overdue`, row.status === "ready" ? `«${row.title}» آماده تحویل است.` : `تحویل‌دادنی «${row.title}» عقب‌افتاده است.`)),
      ...installments.map(row => manual(row, "installment_overdue", `قسط «${row.title}» سررسید گذشته و هنوز کامل وصول نشده است.`)),
      ...unsigned.map(row => manual(row, "contract_unsigned", `قرارداد ${row.contractNumber} هنوز امضا نشده است.`)),
      ...leads.map(row => manual(row, "follow_up_overdue", `پیگیری سرنخ «${row.title}» عقب‌افتاده است.`)),
      ...tomorrowEvents.map(row => manual(row, `${row.eventType}_tomorrow`, `«${row.title}» برای فردا برنامه‌ریزی شده است.`)),
      ...returns.map(row => manual(row, "equipment_return_overdue", `بازگشت «${row.title}» عقب‌افتاده است.`)),
      ...maintenance.map(row => manual(row, "equipment_maintenance", `تجهیز «${row.title}» نیازمند رسیدگی است.`)),
      ...stored,
    ] });
  } catch (error) {
    return apiError(error, "اعلانات آتلیه");
  }
}
