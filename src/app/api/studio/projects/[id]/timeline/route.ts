import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/services/access";
import { apiError } from "@/lib/apiError";
import {
  getProjectTimeline,
  logProjectTimeline,
} from "@/services/studio/projectService";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("studio.view");
    const { id } = await params;

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
    await requirePermission("studio.projects.manage");
    const { id } = await params;
    const body = await req.json();

    const log = await logProjectTimeline(id, {
      actionType: body.actionType || "NOTE_ADDED",
      title: body.title || "یادداشت جدید در تایم‌لاین",
      description: body.description,
      authorName: body.authorName || "مدیر استودیو",
      metadata: body.metadata,
    });

    return NextResponse.json({ success: true, log }, { status: 201 });
  } catch (error) {
    return apiError(error, "ثبت رویداد جدید در تایم‌لاین پروژه");
  }
}
