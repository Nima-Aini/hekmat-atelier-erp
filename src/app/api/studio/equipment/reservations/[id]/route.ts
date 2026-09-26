import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { updateReservationStatus } from "@/services/studio/equipmentService";
import { requireStudioResourceAccess } from "@/services/studio/access";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { actor } = await requireStudioResourceAccess("reservation", id, "studio.equipment.reserve");
    const body = await req.json();

    const action = body.action as "checkout" | "checkin" | "damage" | "cancel" | "confirm";
    if (!["checkout", "checkin", "damage", "cancel", "confirm"].includes(action)) {
      return NextResponse.json(
        { success: false, error: "عملیات ارسالی برای تغییر وضعیت رزرو نامعتبر است." },
        { status: 400 }
      );
    }

    const updated = await updateReservationStatus(id, action, actor, { condition: body.condition, notes: body.notes });
    return NextResponse.json({ success: true, reservation: updated });
  } catch (error) {
    return apiError(error, "تغییر وضعیت رزرو تجهیز");
  }
}
