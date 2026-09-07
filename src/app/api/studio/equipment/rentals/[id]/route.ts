import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/services/access";
import { apiError } from "@/lib/apiError";
import {
  getRentalEquipmentById,
  updateRentalEquipment,
  deleteRentalEquipment,
} from "@/services/studio/equipmentService";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("studio.view");
    const { id } = await params;

    const rental = await getRentalEquipmentById(id);
    return NextResponse.json({ success: true, rental });
  } catch (error) {
    return apiError(error, "دریافت اطلاعات تجهیز اجاره‌ای");
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

    const updated = await updateRentalEquipment(id, body);
    return NextResponse.json({ success: true, rental: updated });
  } catch (error) {
    return apiError(error, "ویرایش تجهیز اجاره‌ای");
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("studio.equipment.manage");
    const { id } = await params;

    const result = await deleteRentalEquipment(id);
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error, "حذف تجهیز اجاره‌ای");
  }
}
