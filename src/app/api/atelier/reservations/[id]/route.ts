import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requirePermission } from "@/services/access";
import {
  completeReservation,
  convertReservationToDailyVisit,
  deleteReservation,
  saveReservation,
} from "@/services/studio/finalWorkflow";
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requirePermission("studio.reservations.manage");
    const { id } = await params;
    const body = await req.json();
    return NextResponse.json({
      success: true,
      reservation: body.action === "complete_delete"
        ? await completeReservation(actor, id)
        : body.action === "convert_to_daily_visit"
          ? await convertReservationToDailyVisit(actor, id, body.dailyVisit || {})
          : await saveReservation(actor, body, id),
    });
  } catch (error) {
    return apiError(error, "ویرایش رزرو");
  }
}
export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requirePermission("studio.reservations.manage");
    const { id } = await params;
    await deleteReservation(actor, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error, "حذف رزرو");
  }
}
