import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/services/access";
import { apiError } from "@/lib/apiError";
import {
  getStudioPipeline,
  updateStudioProjectStage,
} from "@/services/studio/projectService";

export async function GET(_req: NextRequest) {
  try {
    await requirePermission("studio.view");
    const data = await getStudioPipeline();
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    return apiError(error, "دریافت پایپ‌لاین فروش و پروژه‌های آتلیه");
  }
}

export async function POST(req: NextRequest) {
  try {
    await requirePermission("studio.projects.manage");
    const body = await req.json();
    const { projectId, newStage, note, authorName } = body;

    const updated = await updateStudioProjectStage(projectId, newStage, note, authorName);
    return NextResponse.json({ success: true, project: updated });
  } catch (error) {
    return apiError(error, "انتقال مرحله پروژه در پایپ‌لاین");
  }
}
