import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import {
  getProjectTimeline,
  logProjectTimeline,
} from "@/services/studio/projectService";
import { requireStudioProjectAccess } from "@/services/studio/access";
import { logAuditEvent } from "@/services/audit";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await requireStudioProjectAccess(id, "studio.view");

    const timeline = await getProjectTimeline(id);
    return NextResponse.json({ success: true, timeline });
  } catch (error) {
    return apiError(error, "دریافت تایم‌لاین و لاگ‌های پروژه");
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { actor: context } = await requireStudioProjectAccess(id, "studio.projects.manage");
    const body = await req.json();

    const log = await logProjectTimeline(id, {
      actionType: body.actionType || "NOTE_ADDED",
      title: body.title || "یادداشت جدید در تایم‌لاین",
      description: body.description,
      authorName: context.employeeName,
      actorEmployeeId: context.employeeId,
      metadata: body.metadata,
    });
    await logAuditEvent("STUDIO_TIMELINE_ADDED", "studio_project", id, { timelineId: log.id, actionType: log.actionType }, { userId: context.employeeId, employeeId: context.employeeId, userName: context.employeeName });

    return NextResponse.json({ success: true, log }, { status: 201 });
  } catch (error) {
    return apiError(error, "ثبت رویداد جدید در تایم‌لاین پروژه");
  }
}
