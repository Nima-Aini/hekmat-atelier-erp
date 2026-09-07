import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/services/access";
import { apiError } from "@/lib/apiError";
import {
  getStudioCustomerById,
  updateStudioCustomer,
  deleteStudioCustomer,
} from "@/services/studio/customerService";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("studio.view");
    const { id } = await params;

    const customer = await getStudioCustomerById(id);
    return NextResponse.json({ success: true, customer });
  } catch (error) {
    return apiError(error, "دریافت پرونده مشتری آتلیه");
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("studio.projects.manage");
    const { id } = await params;
    const body = await req.json();

    const updated = await updateStudioCustomer(id, body);
    return NextResponse.json({ success: true, customer: updated });
  } catch (error) {
    return apiError(error, "ویرایش اطلاعات مشتری آتلیه");
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("studio.projects.manage");
    const { id } = await params;

    const result = await deleteStudioCustomer(id);
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error, "حذف پرونده مشتری آتلیه");
  }
}
