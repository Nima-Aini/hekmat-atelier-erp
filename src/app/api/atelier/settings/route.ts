import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requirePermission } from "@/services/access";
import {
  getAtelierConfig,
  listProjectTypes,
  saveAtelierConfig,
  saveProjectType,
} from "@/services/studio/finalWorkflow";
export async function GET() {
  try {
    await requirePermission("studio.view");
    return NextResponse.json({
      success: true,
      config: await getAtelierConfig(),
      projectTypes: await listProjectTypes(true),
    });
  } catch (error) {
    return apiError(error, "دریافت تنظیمات آتلیه");
  }
}
export async function PUT(req: NextRequest) {
  try {
    const actor = await requirePermission("admin.settings");
    const body = await req.json();
    if (body.action === "project_type")
      return NextResponse.json({
        success: true,
        projectType: await saveProjectType(actor, body.value, body.id),
      });
    return NextResponse.json({
      success: true,
      config: await saveAtelierConfig(actor, body.config),
    });
  } catch (error) {
    return apiError(error, "ذخیره تنظیمات آتلیه");
  }
}
