import { NextRequest, NextResponse } from "next/server";
import { canAccessPermission, getScopedProjectIds, requirePermission } from "@/services/access";
import { apiError } from "@/lib/apiError";
import {
  listStudioProjects,
  createStudioProject,
} from "@/services/studio/projectService";

export async function GET(req: NextRequest) {
  try {
    const actor = await requirePermission("studio.view");
    const allowedCoreProjectIds = await getScopedProjectIds();
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
      allowedCoreProjectIds,
    });
    (result as any).projects = await Promise.all(result.projects.map(async (project) => (await canAccessPermission(actor, "studio.contract.view", (project as any).projectId))
      ? project
      : { ...project, totalContractValue: null }));

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return apiError(error, "دریافت فهرست پروژه‌های آتلیه");
  }
}

export async function POST(req: NextRequest) {
  try {
    const context = await requirePermission("studio.projects.manage");
    const body = await req.json();
    if (body.coreProjectId) await requirePermission("studio.projects.manage", body.coreProjectId);

    const created = await createStudioProject({ ...body, actorId: context.employeeId, authorName: context.employeeName });
    return NextResponse.json({ success: true, project: created }, { status: 201 });
  } catch (error) {
    return apiError(error, "ایجاد پروژه جدید در آتلیه");
  }
}
