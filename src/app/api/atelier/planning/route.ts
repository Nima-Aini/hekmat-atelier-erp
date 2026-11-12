import { NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { getScopedProjectIds, requireAnyPermission } from "@/services/access";
import { getPlanning } from "@/services/studio/finalWorkflow";
export async function GET() {
  try {
    await requireAnyPermission(["studio.planning.view", "studio.planning.manage", "studio.view"]);
    return NextResponse.json({
      success: true,
      planning: await getPlanning(await getScopedProjectIds()),
    });
  } catch (error) {
    return apiError(error, "دریافت برنامه‌ریزی قراردادها");
  }
}
