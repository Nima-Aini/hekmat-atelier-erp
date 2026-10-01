import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requirePermission } from "@/services/access";
import {
  deleteDailyVisit,
  saveDailyVisit,
} from "@/services/studio/finalWorkflow";
import { assertDailyVisitFinancialPermissions } from "@/services/studio/dailyVisitAuthorization";
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requirePermission("studio.daily_visits.manage");
    const { id } = await params;
    const body = await req.json();
    await assertDailyVisitFinancialPermissions(actor, body, false);
    return NextResponse.json({
      success: true,
      visit: await saveDailyVisit(actor, body, id),
    });
  } catch (error) {
    return apiError(error, "ویرایش مراجعه روزانه");
  }
}
export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requirePermission("studio.daily_visits.manage");
    const { id } = await params;
    await deleteDailyVisit(actor, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error, "حذف مراجعه روزانه");
  }
}
