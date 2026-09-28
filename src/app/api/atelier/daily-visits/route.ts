import { NextRequest, NextResponse } from "next/server";
import { apiError, pageNumber } from "@/lib/apiError";
import { requireAnyPermission, requirePermission } from "@/services/access";
import { parseDashboardRange } from "@/lib/dashboardRange";
import {
  listDailyVisits,
  saveDailyVisit,
} from "@/services/studio/finalWorkflow";

export async function GET(req: NextRequest) {
  try {
    await requireAnyPermission(["studio.daily_visits.view", "studio.daily_visits.manage", "studio.view"]);
    const p = new URL(req.url).searchParams;
    const range = p.has("from") || p.has("to") ? parseDashboardRange(p.get("from"), p.get("to")) : null;
    const paged = p.has("page");
    const page = paged ? pageNumber(p.get("page"), 1) : 1;
    const pageSize = paged ? pageNumber(p.get("pageSize"), 100, 100) : 300;
    const visits = await listDailyVisits({
      search: p.get("search") || undefined,
      from: range?.start,
      to: range?.end,
      payment: p.get("payment") || undefined,
      limit: paged ? pageSize + 1 : undefined,
      offset: paged ? (page - 1) * pageSize : undefined,
    });
    return NextResponse.json({
      success: true,
      visits: paged ? visits.slice(0, pageSize) : visits,
      ...(paged ? { hasMore: visits.length > pageSize } : {}),
    });
  } catch (error) {
    return apiError(error, "دریافت مراجعات روزانه");
  }
}
export async function POST(req: NextRequest) {
  try {
    const actor = await requirePermission("studio.daily_visits.manage");
    return NextResponse.json(
      { success: true, visit: await saveDailyVisit(actor, await req.json()) },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error, "ثبت مراجعه روزانه");
  }
}
