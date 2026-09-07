import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/services/access";
import { apiError } from "@/lib/apiError";
import {
  listStudioProjects,
  createStudioProject,
} from "@/services/studio/projectService";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("studio.view");
    const { searchParams } = new URL(req.url);

    const search = searchParams.get("search") || undefined;
    const status = searchParams.get("status") || undefined;
    const eventType = searchParams.get("eventType") || undefined;
    const customerId = searchParams.get("customerId") || undefined;
    const page = searchParams.get("page") ? Number(searchParams.get("page")) : undefined;
    const pageSize = searchParams.get("pageSize") ? Number(searchParams.get("pageSize")) : undefined;

    const result = await listStudioProjects({
      search,
      status,
      eventType,
      customerId,
      page,
      pageSize,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiError(error, "دریافت فهرست پروژه‌های آتلیه");
  }
}

export async function POST(req: NextRequest) {
  try {
    await requirePermission("studio.projects.manage");
    const body = await req.json();

    const created = await createStudioProject(body);
    return NextResponse.json({ success: true, project: created }, { status: 201 });
  } catch (error) {
    return apiError(error, "ایجاد پروژه جدید در آتلیه");
  }
}
