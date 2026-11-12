import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { getScopedProjectIds, requirePermission } from "@/services/access";
import { getEquipmentUsage } from "@/services/studio/equipmentCalendar";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("studio.equipment.view");
    const query = req.nextUrl.searchParams;
    const usage = await getEquipmentUsage(new Date(query.get("from") || ""), new Date(query.get("to") || ""), await getScopedProjectIds(["studio.equipment.view"]), query.get("equipmentId") || undefined);
    return NextResponse.json({ success: true, usage });
  } catch (error) { return apiError(error, "دریافت تقویم تجهیزات"); }
}
