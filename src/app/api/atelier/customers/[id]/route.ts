import { NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requireAnyPermission } from "@/services/access";
import { getAtelierCustomerProfile } from "@/services/studio/customerProfile";
import { updateStudioCustomer } from "@/services/studio/customerService";
import { requireStudioCustomerAccess } from "@/services/studio/access";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAnyPermission(["studio.customers.view", "studio.view"]);
    const { id } = await params;
    return NextResponse.json({ success: true, profile: await getAtelierCustomerProfile(actor, id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error, "دریافت پرونده کامل مشتری"); }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const actor = await requireStudioCustomerAccess(id, "studio.customers.edit");
    const audit = { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName };
    return NextResponse.json({ success: true, customer: await updateStudioCustomer(id, await request.json(), audit, actor.roleCode === "admin") });
  } catch (error) { return apiError(error, "ویرایش اطلاعات مشتری"); }
}
