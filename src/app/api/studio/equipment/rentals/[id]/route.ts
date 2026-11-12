import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import {
  getRentalEquipmentById,
  updateRentalEquipment,
  deleteRentalEquipment,
} from "@/services/studio/equipmentService";
import { requireStudioResourceAccess } from "@/services/studio/access";

async function requireRentalPermission(id: string, permission: string) {
  const rental = await getRentalEquipmentById(id);
  await requireStudioResourceAccess("rental", id, permission);
  return rental;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rental = await requireRentalPermission(id, "studio.finance.view");
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
    const { id } = await params;
    await requireRentalPermission(id, "studio.finance.manage");
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
    const { id } = await params;
    await requireRentalPermission(id, "studio.finance.manage");

    const result = await deleteRentalEquipment(id);
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error, "حذف تجهیز اجاره‌ای");
  }
}
