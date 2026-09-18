import { NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { getScopedProjectIds, requireAnyPermission } from "@/services/access";
import { getFinalNotifications } from "@/services/studio/finalInsights";

export async function GET() {
  try {
    await requireAnyPermission(["studio.notifications.view", "studio.view"]);
    return NextResponse.json({
      success: true,
      notifications: await getFinalNotifications(await getScopedProjectIds()),
    });
  } catch (error) {
    return apiError(error, "دریافت اعلانات آتلیه");
  }
}
