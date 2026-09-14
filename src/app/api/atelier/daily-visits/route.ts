import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requirePermission } from "@/services/access";
import {
  listDailyVisits,
  saveDailyVisit,
} from "@/services/studio/finalWorkflow";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("studio.view");
    const p = new URL(req.url).searchParams;
    return NextResponse.json({
      success: true,
      visits: await listDailyVisits({
        search: p.get("search") || undefined,
        from: p.get("from") ? new Date(p.get("from")!) : undefined,
        to: p.get("to") ? new Date(p.get("to")!) : undefined,
        payment: p.get("payment") || undefined,
      }),
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
