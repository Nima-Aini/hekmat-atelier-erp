import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/services/access";
import { apiError } from "@/lib/apiError";
import {
  getStudioProjectById,
  updateStudioProject,
} from "@/services/studio/projectService";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("studio.view");
    const { id } = await params;

    const project = await getStudioProjectById(id);
    return NextResponse.json({ success: true, project });
  } catch (error) {
    return apiError(error, "دریافت پرونده پروژه آتلیه");
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("studio.projects.manage");
    const { id } = await params;
    const body = await req.json();

    const updated = await updateStudioProject(id, body);
    return NextResponse.json({ success: true, project: updated });
  } catch (error) {
    return apiError(error, "ویرایش اطلاعات پروژه");
  }
}
