import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requirePermission } from "@/services/access";
import {
  deleteDailyVisit,
  saveDailyVisit,
} from "@/services/studio/finalWorkflow";
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requirePermission("studio.daily_visits.manage");
    const { id } = await params;
    return NextResponse.json({
      success: true,
      visit: await saveDailyVisit(actor, await req.json(), id),
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
