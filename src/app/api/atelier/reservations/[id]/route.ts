import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiError, assertUuid } from "@/lib/apiError";
import { requirePermission } from "@/services/access";
import {
  completeReservation,
  convertReservationToDailyVisit,
  deleteReservation,
  saveReservation,
} from "@/services/studio/finalWorkflow";
import { assertDailyVisitFinancialPermissions } from "@/services/studio/dailyVisitAuthorization";
import { db } from "@/db";
import { studioReservations } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { reservationScope } from "@/services/studio/reservationAccess";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission("studio.reservations.view");
    const { id } = await params;
    assertUuid(id);
    const [reservation] = await db.select({
      id: studioReservations.id,
      title: studioReservations.title,
      reservedAt: studioReservations.reservedAt,
      customerName: studioReservations.customerName,
      mobile: studioReservations.mobile,
      notes: studioReservations.notes,
      status: studioReservations.status,
      updatedAt: studioReservations.updatedAt,
    }).from(studioReservations).where(and(eq(studioReservations.id, id), await reservationScope(actor))).limit(1);
    if (!reservation || reservation.status === "cancelled") throw new ApiError(404, "رزرو یافت نشد.");
    return NextResponse.json({ success: true, reservation }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error, "دریافت رزرو");
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requirePermission("studio.reservations.edit");
    const { id } = await params;
    const body = await req.json();
    if (["complete_delete", "convert_to_daily_visit"].includes(body.action)) await requirePermission("studio.reservations.delete");
    if (body.action === "convert_to_daily_visit") {
      await requirePermission("studio.daily_visits.manage");
      await assertDailyVisitFinancialPermissions(actor, body.dailyVisit || {}, true);
    }
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
    const actor = await requirePermission("studio.reservations.delete");
    const { id } = await params;
    await deleteReservation(actor, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error, "حذف رزرو");
  }
}
