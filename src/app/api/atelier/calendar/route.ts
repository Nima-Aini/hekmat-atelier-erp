import { NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { getScopedProjectIds, requirePermission } from "@/services/access";
import { getFinalCalendar } from "@/services/studio/finalInsights";

export async function GET() {
  try {
    await requirePermission("studio.calendar.view");
    return NextResponse.json({
      success: true,
      calendar: await getFinalCalendar(await getScopedProjectIds()),
    });
  } catch (error) {
    return apiError(error, "دریافت تقویم قراردادها");
  }
}
