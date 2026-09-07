import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/services/access";
import { apiError } from "@/lib/apiError";
import { updateReservationStatus } from "@/services/studio/equipmentService";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("studio.equipment.reserve");
    const { id } = await params;
    const body = await req.json();

    const action = body.action as "checkout" | "checkin" | "cancel" | "confirm";
    if (!["checkout", "checkin", "cancel", "confirm"].includes(action)) {
      return NextResponse.json(
        { success: false, error: "عملیات ارسالی برای تغییر وضعیت رزرو نامعتبر است." },
        { status: 400 }
      );
    }

    const updated = await updateReservationStatus(id, action);
    return NextResponse.json({ success: true, reservation: updated });
  } catch (error) {
    return apiError(error, "تغییر وضعیت رزرو تجهیز");
  }
}
