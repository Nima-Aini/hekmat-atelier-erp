import { and, count, eq, inArray, lt, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { equipmentReservations, studioLeads, studioNotifications, studioProjects, studioTasks } from "@/db/schema";
import { ApiError, apiError } from "@/lib/apiError";
import { getEmployeeContext, getScopedProjectIds } from "@/services/access";

export async function GET() {
  try {
    const actor = await getEmployeeContext();
    if (!actor) throw new ApiError(401, "ابتدا وارد شوید.");
    const ids = await getScopedProjectIds();
    const scope = ids === null ? undefined : ids.length ? inArray(studioProjects.projectId, ids) : sql`false`;
    const now = new Date();
    const [leadRows, taskRows, notificationRows, equipmentRows] = await Promise.all([
      db.select({ total: count() }).from(studioLeads).where(and(actor.permissions.has("*") ? undefined : eq(studioLeads.assignedEmployeeId, actor.employeeId), lt(studioLeads.nextFollowUp, now), inArray(studioLeads.stage, ["lead", "contact", "consultation", "proposal", "contract_pending"]))),
      db.select({ total: count() }).from(studioTasks).innerJoin(studioProjects, eq(studioProjects.id, studioTasks.studioProjectId)).where(and(scope, inArray(studioTasks.status, ["open", "in_progress"]), or(eq(studioTasks.priority, "urgent"), lt(studioTasks.dueDate, now)))),
      db.select({ total: count() }).from(studioNotifications).leftJoin(studioProjects, eq(studioProjects.id, studioNotifications.studioProjectId)).where(and(scope, inArray(studioNotifications.status, ["pending", "failed"]))),
      db.select({ total: count() }).from(equipmentReservations).leftJoin(studioProjects, eq(studioProjects.id, equipmentReservations.studioProjectId)).where(and(scope, eq(equipmentReservations.status, "checked_out"), lt(equipmentReservations.reservedTo, now))),
    ]);
    return NextResponse.json({ success: true, badges: { studio_crm: Number(leadRows[0]?.total || 0), tasks: Number(taskRows[0]?.total || 0), alerts: Number(notificationRows[0]?.total || 0) + Number(taskRows[0]?.total || 0), studio_equipment: Number(equipmentRows[0]?.total || 0) } });
  } catch (error) { return apiError(error); }
}
