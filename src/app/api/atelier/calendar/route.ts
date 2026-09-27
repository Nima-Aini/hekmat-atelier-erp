import { NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { canAccessPermission, getScopedProjectIds, requirePermission } from "@/services/access";
import { getFinalCalendar } from "@/services/studio/finalInsights";

export async function GET() {
  try {
    const actor = await requirePermission("studio.calendar.view");
    const financeIds = await canAccessPermission(actor, "studio.finance.view") ? await getScopedProjectIds(["studio.finance.view"]) : [];
    return NextResponse.json({
      success: true,
      calendar: await getFinalCalendar(await getScopedProjectIds(["studio.calendar.view"]), financeIds),
    });
  } catch (error) {
    return apiError(error, "دریافت تقویم قراردادها");
  }
}
