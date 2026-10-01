import { NextResponse } from "next/server";
import { apiError, ApiError } from "@/lib/apiError";
import { NextRequest } from "next/server";
import { getScopedProjectIds, requirePermission } from "@/services/access";
import { getFinalNotifications, setNotificationArchived, setNotificationRead } from "@/services/studio/finalInsights";
import { filterNotifications } from "@/lib/atelierNotifications";

export async function GET(req: NextRequest) {
  try {
    const actor = await requirePermission("studio.notifications.view");
    const query = new URL(req.url).searchParams;
    return NextResponse.json({
      success: true,
      notifications: filterNotifications(await getFinalNotifications(await getScopedProjectIds(), query.get("archived") === "true", actor), query.get("category") || "all", query.get("state") || "all"),
    });
  } catch (error) {
    return apiError(error, "دریافت اعلانات آتلیه");
  }
}

export async function PUT(req: NextRequest) {
  try {
    const actor = await requirePermission("studio.notifications.view");
    const body = await req.json();
    const scope = await getScopedProjectIds();
    const visible = await getFinalNotifications(scope, body.archived === false, actor);
    if (!visible.some(row => row.id === body.id)) throw new ApiError(404, "اعلان در دسترس نیست.");
    if (body.read === true) { await setNotificationRead(actor, String(body.id)); return NextResponse.json({ success: true }); }
    return NextResponse.json({ success: true, notification: await setNotificationArchived(actor, String(body.id || ""), Boolean(body.archived)) });
  } catch (error) {
    return apiError(error, "تغییر وضعیت آرشیو اعلان");
  }
}
