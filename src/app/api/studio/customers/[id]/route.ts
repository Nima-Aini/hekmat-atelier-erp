import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import {
  getStudioCustomerById,
  updateStudioCustomer,
  deleteStudioCustomer,
} from "@/services/studio/customerService";
import { requireStudioCustomerAccess } from "@/services/studio/access";
import { canAccessPermission } from "@/services/access";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const actor = await requireStudioCustomerAccess(id, "studio.view");

    const customer: any = await getStudioCustomerById(id);
    const projects = [];
    for (const project of customer.projects || []) {
      if (!(await canAccessPermission(actor, "studio.view", project.projectId))) continue;
      projects.push((await canAccessPermission(actor, "studio.contract.view", project.projectId)) ? project : { ...project, totalContractValue: null });
    }
    customer.projects = projects;
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
    const { id } = await params;
    await requireStudioCustomerAccess(id, "studio.projects.manage");
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
    const { id } = await params;
    await requireStudioCustomerAccess(id, "studio.projects.manage");

    const result = await deleteStudioCustomer(id);
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error, "حذف پرونده مشتری آتلیه");
  }
}
