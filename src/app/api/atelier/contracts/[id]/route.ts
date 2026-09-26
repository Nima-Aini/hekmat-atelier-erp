import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import {
  getContractById,
  updateContract,
} from "@/services/studio/finalWorkflow";
import { requireStudioResourceAccess } from "@/services/studio/access";
import { canAccessPermission } from "@/services/access";

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { actor, owner } = await requireStudioResourceAccess("contract", id, "studio.contract.view");
    const contract = await getContractById(id);
    const finance = await canAccessPermission(actor, "studio.finance.view", owner.coreProjectId);
    return NextResponse.json({ success: true, contract: finance ? contract : { ...contract, totalAmount: null, depositAmount: null, paidAmount: null, remainingAmount: null, items: contract.items.map((item) => ({ ...item, unitPrice: null })) } });
  } catch (error) {
    return apiError(error, "دریافت قرارداد");
  }
}
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    let { actor } = await requireStudioResourceAccess(
      "contract",
      id,
      "studio.contract.manage",
    );
    const body = await req.json();
    if (body.items !== undefined || body.paidAmount !== undefined || body.paymentAccountId !== undefined) ({ actor } = await requireStudioResourceAccess("contract", id, "studio.finance.manage"));
    return NextResponse.json({
      success: true,
      contract: await updateContract(actor, id, body),
    });
  } catch (error) {
    return apiError(error, "ویرایش قرارداد");
  }
}
