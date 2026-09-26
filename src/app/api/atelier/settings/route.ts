import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requireAnyPermission, requirePermission } from "@/services/access";
import {
  getAtelierConfig,
  listProjectTypes,
  saveAtelierConfig,
  saveProjectType,
  listDailyVisitTitles,
  saveDailyVisitTitle,
} from "@/services/studio/finalWorkflow";
import { listAtelierCatalog, saveCatalog } from "@/services/studio/catalog";
export async function GET() {
  try {
    await requireAnyPermission([
      "settings.view", "studio.view", "studio.contract.view", "studio.contract.manage",
      "studio.daily_visits.view", "studio.daily_visits.manage", "studio.reservations.view",
      "studio.planning.view", "studio.calendar.view", "studio.personnel.view",
      "studio.equipment.view", "studio.equipment.manage",
    ]);
    return NextResponse.json({
      success: true,
      config: await getAtelierConfig(),
      projectTypes: await listProjectTypes(true),
      catalog: await listAtelierCatalog(true),
      dailyVisitTitles: await listDailyVisitTitles(true),
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
    if (body.action === "catalog")
      return NextResponse.json({ success: true, catalogItem: await saveCatalog(actor, body.value, body.id) });
    if (body.action === "daily_visit_title")
      return NextResponse.json({ success: true, dailyVisitTitle: await saveDailyVisitTitle(actor, body.value, body.id) });
    return NextResponse.json({
      success: true,
      config: await saveAtelierConfig(actor, body.config),
    });
  } catch (error) {
    return apiError(error, "ذخیره تنظیمات آتلیه");
  }
}
