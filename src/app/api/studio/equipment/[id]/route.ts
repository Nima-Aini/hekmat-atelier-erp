import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/services/access";
import { apiError } from "@/lib/apiError";
import {
  getStudioEquipmentById,
  updateStudioEquipment,
  deleteOrRetireEquipment,
} from "@/services/studio/equipmentService";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("studio.view");
    const { id } = await params;

    const equipment = await getStudioEquipmentById(id);
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
