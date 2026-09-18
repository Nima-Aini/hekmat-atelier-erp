import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requireAnyPermission, requirePermission } from "@/services/access";
import {
  listReservations,
  saveReservation,
} from "@/services/studio/finalWorkflow";
export async function GET() {
  try {
    await requireAnyPermission(["studio.reservations.view", "studio.reservations.manage", "studio.view"]);
    return NextResponse.json({
      success: true,
      reservations: await listReservations(),
    });
  } catch (error) {
    return apiError(error, "دریافت رزروها");
  }
}
export async function POST(req: NextRequest) {
  try {
    const actor = await requirePermission("studio.reservations.manage");
    return NextResponse.json(
      {
        success: true,
        reservation: await saveReservation(actor, await req.json()),
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error, "ثبت رزرو");
  }
}
