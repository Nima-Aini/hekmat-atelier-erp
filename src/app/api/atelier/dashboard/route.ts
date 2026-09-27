import { NextResponse } from "next/server";
import { ApiError, apiError, assertUuid } from "@/lib/apiError";
import { parseDashboardRange } from "@/lib/dashboardRange";
import {
  canAccessPermission,
  getScopedProjectIds,
  requireAnyPermission,
} from "@/services/access";
import { getFinalDashboard } from "@/services/studio/finalInsights";

export async function GET(request: Request) {
  try {
    const actor = await requireAnyPermission(["studio.dashboard.view", "studio.view"]);
    let includeFinance = await canAccessPermission(
      actor,
      "studio.finance.view",
    );
    const params = new URL(request.url).searchParams;
    const projectId = params.get("projectId") || undefined;
    const allowed = await getScopedProjectIds(["studio.dashboard.view", "studio.view"]);
    if (projectId) {
      assertUuid(projectId);
      if (allowed !== null && !allowed.includes(projectId)) throw new ApiError(403, "دسترسی شما به این پروژه مجاز نیست.", "PROJECT_SCOPE_FORBIDDEN");
      if (!(await canAccessPermission(actor, "studio.dashboard.view", projectId)) && !(await canAccessPermission(actor, "studio.view", projectId))) throw new ApiError(403, "دسترسی شما به داشبورد این پروژه مجاز نیست.");
      includeFinance = includeFinance && await canAccessPermission(actor, "studio.finance.view", projectId);
    }
    let range;
    try { range = parseDashboardRange(params.get("startDate"), params.get("endDate")); }
    catch (error) { throw new ApiError(400, error instanceof Error ? error.message : "بازه نامعتبر است."); }
    return NextResponse.json({
      success: true,
      dashboard: await getFinalDashboard(
        allowed,
        includeFinance,
        { range, projectId, financeProjectIds: includeFinance ? await getScopedProjectIds(["studio.finance.view"]) : [] },
      ),
    });
  } catch (error) {
    return apiError(error, "دریافت داشبورد آتلیه");
  }
}
