import { NextRequest, NextResponse } from "next/server";
import { canAccessPermission, requirePermission } from "@/services/access";
import { apiError } from "@/lib/apiError";
import {
  getStudioEquipmentById,
  updateStudioEquipment,
  deleteOrRetireEquipment,
} from "@/services/studio/equipmentService";
import { resolveStudioResourceOwner } from "@/services/studio/access";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requirePermission("studio.view");
    const { id } = await params;

    const equipment: any = await getStudioEquipmentById(id);
    const visibleReservations = [];
    for (const reservation of equipment.reservations || []) {
      const owner = await resolveStudioResourceOwner("reservation", reservation.id);
      if (await canAccessPermission(actor, "studio.view", owner.coreProjectId)) visibleReservations.push(reservation);
    }
    equipment.reservations = visibleReservations;
    return NextResponse.json({ success: true, equipment });
  } catch (error) {
    return apiError(error, "دریافت مشخصات تجهیز");
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("studio.equipment.manage");
    const { id } = await params;
    const body = await req.json();

    const updated = await updateStudioEquipment(id, body);
    return NextResponse.json({ success: true, equipment: updated });
  } catch (error) {
    return apiError(error, "ویرایش اطلاعات تجهیز");
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("studio.equipment.manage");
    const { id } = await params;

    const result = await deleteOrRetireEquipment(id);
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error, "حذف یا بازنشستگی تجهیز");
  }
}
