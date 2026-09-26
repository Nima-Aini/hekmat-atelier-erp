import { NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import {
  canAccessPermission,
  getScopedProjectIds,
  requireAnyPermission,
} from "@/services/access";
import { getFinalDashboard } from "@/services/studio/finalInsights";

export async function GET() {
  try {
    const actor = await requireAnyPermission(["studio.dashboard.view", "studio.view"]);
    const includeFinance = await canAccessPermission(
      actor,
      "studio.finance.view",
    );
    return NextResponse.json({
      success: true,
      dashboard: await getFinalDashboard(
        await getScopedProjectIds(),
        includeFinance,
      ),
    });
  } catch (error) {
    return apiError(error, "دریافت داشبورد آتلیه");
  }
}
