import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/services/access";
import { apiError } from "@/lib/apiError";
import {
  getStudioPersonnelById,
  updateStudioPersonnel,
  deleteStudioPersonnel,
} from "@/services/studio/personnelService";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("studio.view");
    const { id } = await params;

    const personnel = await getStudioPersonnelById(id);
    return NextResponse.json({ success: true, personnel });
  } catch (error) {
    return apiError(error, "دریافت مشخصات پرسنل");
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("studio.personnel.manage");
    const { id } = await params;
    const body = await req.json();

    const updated = await updateStudioPersonnel(id, body);
    return NextResponse.json({ success: true, personnel: updated });
  } catch (error) {
    return apiError(error, "ویرایش پرسنل");
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("studio.personnel.manage");
    const { id } = await params;

    const result = await deleteStudioPersonnel(id);
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error, "حذف پرسنل");
  }
}
