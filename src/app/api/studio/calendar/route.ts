import { NextRequest, NextResponse } from "next/server";
import { getScopedProjectIds } from "@/services/access";
import { ApiError, apiError, assertUuid } from "@/lib/apiError";
import { db } from "@/db";
import {
  studioCalendarEvents,
  studioProjects,
  studioPersonnel,
} from "@/db/schema";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { requireStudioGlobalAccess, requireStudioProjectAccess } from "@/services/studio/access";
import { assertPersonnelScheduleAvailable, lockScheduleResources } from "@/services/studio/scheduling";
import { logAuditEvent } from "@/services/audit";
import { logProjectTimeline } from "@/services/studio/projectService";

export async function GET(req: NextRequest) {
  try {
    const actor = await requireStudioGlobalAccess("studio.view");
    const allowedCoreProjectIds = await getScopedProjectIds();
    const { searchParams } = new URL(req.url);

    const fromDate = searchParams.get("from") ? new Date(searchParams.get("from")!) : undefined;
    const toDate = searchParams.get("to") ? new Date(searchParams.get("to")!) : undefined;
    if ((fromDate && Number.isNaN(fromDate.getTime())) || (toDate && Number.isNaN(toDate.getTime()))) throw new ApiError(400, "بازه زمانی تقویم نامعتبر است.");
    const projectId = searchParams.get("projectId");

    const conditions = [];
    if (allowedCoreProjectIds !== null) conditions.push(or(allowedCoreProjectIds.length ? inArray(studioProjects.projectId, allowedCoreProjectIds) : sql`false`, eq(studioCalendarEvents.ownerEmployeeId, actor.employeeId))!);

    if (projectId) {
      assertUuid(projectId);
      conditions.push(eq(studioCalendarEvents.studioProjectId, projectId));
    }

    if (fromDate) {
      conditions.push(sql`${studioCalendarEvents.endTime} >= ${fromDate}`);
    }

    if (toDate) {
      conditions.push(sql`${studioCalendarEvents.startTime} <= ${toDate}`);
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const events = await db
      .select({
        id: studioCalendarEvents.id,
        ownerEmployeeId: studioCalendarEvents.ownerEmployeeId,
        studioProjectId: studioCalendarEvents.studioProjectId,
        title: studioCalendarEvents.title,
        eventType: studioCalendarEvents.eventType,
        startTime: studioCalendarEvents.startTime,
        endTime: studioCalendarEvents.endTime,
        location: studioCalendarEvents.location,
        assignedPersonnelIds: studioCalendarEvents.assignedPersonnelIds,
        status: studioCalendarEvents.status,
        notes: studioCalendarEvents.notes,
        createdAt: studioCalendarEvents.createdAt,
        projectTitle: studioProjects.title,
        projectNumber: studioProjects.projectNumber,
      })
      .from(studioCalendarEvents)
      .leftJoin(studioProjects, eq(studioCalendarEvents.studioProjectId, studioProjects.id))
      .where(where)
      .orderBy(studioCalendarEvents.startTime)
      .limit(200);

    return NextResponse.json({ success: true, events });
  } catch (error) {
    return apiError(error, "دریافت تقویم آتلیه");
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const eventType = body.eventType || "shooting";
    const status = body.status || "scheduled";
    if (!["shooting", "consultation", "selection_session", "venue_visit", "delivery", "maintenance"].includes(eventType)) throw new ApiError(400, "نوع رویداد نامعتبر است.");
    if (!["tentative", "scheduled", "confirmed", "completed", "postponed", "cancelled"].includes(status)) throw new ApiError(400, "وضعیت رویداد نامعتبر است.");

    if (!body.title || !body.title.trim()) {
      throw new ApiError(400, "عنوان رویداد الزامی است.");
    }

    const startTime = new Date(body.startTime);
    const endTime = new Date(body.endTime);

    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      throw new ApiError(400, "زمان شروع یا پایان رویداد نامعتبر است.");
    }

    if (startTime >= endTime) {
      throw new ApiError(400, "زمان پایان باید بعد از زمان شروع باشد.");
    }

    const actor = body.studioProjectId
      ? (await requireStudioProjectAccess(body.studioProjectId, "studio.production.manage")).actor
      : await requireStudioGlobalAccess("studio.production.manage");
    const personnelIds = Array.isArray(body.assignedPersonnelIds) ? [...new Set<string>(body.assignedPersonnelIds)] : [];
    personnelIds.forEach(assertUuid);

    const event = await db.transaction(async (tx) => {
      await lockScheduleResources(tx, [], personnelIds);
      if (personnelIds.length) {
        const found = await tx.select({ id: studioPersonnel.id }).from(studioPersonnel).where(inArray(studioPersonnel.id, personnelIds));
        if (found.length !== personnelIds.length) throw new ApiError(404, "یک یا چند نیروی انتخاب‌شده یافت نشد.");
      }
      for (const personnelId of personnelIds) await assertPersonnelScheduleAvailable(tx, personnelId, startTime, endTime);
      const [saved] = await tx.insert(studioCalendarEvents).values({
        ownerEmployeeId: actor.employeeId,
        studioProjectId: body.studioProjectId || null,
        title: body.title.trim(),
        eventType,
        startTime,
        endTime,
        location: body.location || null,
        assignedPersonnelIds: personnelIds,
        status,
        notes: body.notes?.trim() || null,
      }).returning();
      if (saved.studioProjectId) await logProjectTimeline(saved.studioProjectId, { actionType: "CALENDAR_EVENT_CREATED", title: "ثبت رویداد تقویم", description: saved.title, authorName: actor.employeeName, actorEmployeeId: actor.employeeId, metadata: { eventId: saved.id, personnelIds } }, tx);
      await logAuditEvent("STUDIO_CALENDAR_CREATED", "studio_calendar_event", saved.id, { studioProjectId: saved.studioProjectId, personnelIds, startTime: startTime.toISOString(), endTime: endTime.toISOString() }, { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName }, tx);
      return saved;
    });

    return NextResponse.json({ success: true, event }, { status: 201 });
  } catch (error) {
    return apiError(error, "ثبت رویداد تقویم");
  }
}
