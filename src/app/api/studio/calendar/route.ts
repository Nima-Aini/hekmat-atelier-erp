import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/services/access";
import { apiError, assertUuid } from "@/lib/apiError";
import { db } from "@/db";
import {
  studioCalendarEvents,
  studioProjects,
  equipmentReservations,
  studioEquipment,
  studioPersonnel,
} from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("studio.view");
    const { searchParams } = new URL(req.url);

    const fromDate = searchParams.get("from") ? new Date(searchParams.get("from")!) : undefined;
    const toDate = searchParams.get("to") ? new Date(searchParams.get("to")!) : undefined;
    const projectId = searchParams.get("projectId");

    const conditions = [];

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
    await requirePermission("studio.projects.manage");
    const body = await req.json();

    if (!body.title || !body.title.trim()) {
      return NextResponse.json({ success: false, error: "عنوان رویداد الزامی است." }, { status: 400 });
    }

    const startTime = new Date(body.startTime);
    const endTime = new Date(body.endTime);

    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      return NextResponse.json({ success: false, error: "زمان شروع یا پایان رویداد نامعتبر است." }, { status: 400 });
    }

    if (startTime >= endTime) {
      return NextResponse.json({ success: false, error: "زمان پایان باید بعد از زمان شروع باشد." }, { status: 400 });
    }

    if (body.studioProjectId) {
      assertUuid(body.studioProjectId);
    }

    const [event] = await db
      .insert(studioCalendarEvents)
      .values({
        studioProjectId: body.studioProjectId || null,
        title: body.title.trim(),
        eventType: body.eventType || "shooting",
        startTime,
        endTime,
        location: body.location || null,
        assignedPersonnelIds: Array.isArray(body.assignedPersonnelIds) ? body.assignedPersonnelIds : [],
        status: body.status || "scheduled",
        notes: body.notes?.trim() || null,
      })
      .returning();

    return NextResponse.json({ success: true, event }, { status: 201 });
  } catch (error) {
    return apiError(error, "ثبت رویداد تقویم");
  }
}
