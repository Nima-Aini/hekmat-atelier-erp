import { NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { NextRequest } from "next/server";
import { getScopedProjectIds, requireAnyPermission, requirePermission } from "@/services/access";
import { getFinalNotifications, setNotificationArchived } from "@/services/studio/finalInsights";

export async function GET(req: NextRequest) {
  try {
    await requireAnyPermission(["studio.notifications.view", "studio.view"]);
    return NextResponse.json({
      success: true,
      notifications: await getFinalNotifications(await getScopedProjectIds(), new URL(req.url).searchParams.get("archived") === "true"),
    });
  } catch (error) {
    return apiError(error, "دریافت اعلانات آتلیه");
  }
}

export async function PUT(req: NextRequest) {
  try {
    const actor = await requirePermission("studio.notifications.view");
    const body = await req.json();
    return NextResponse.json({ success: true, notification: await setNotificationArchived(actor, String(body.id || ""), Boolean(body.archived)) });
  } catch (error) {
    return apiError(error, "تغییر وضعیت آرشیو اعلان");
  }
}
