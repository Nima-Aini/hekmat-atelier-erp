import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import {
  getContractById,
  updateContract,
} from "@/services/studio/finalWorkflow";
import { requireStudioResourceAccess } from "@/services/studio/access";
import { canAccessPermission } from "@/services/access";
import { redactContractFinance } from "@/services/studio/financialPrivacy";
import { deletePreContract } from "@/services/studio/contractLifecycle";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { actor } = await requireStudioResourceAccess("contract", id, "studio.contract.delete_draft");
    return NextResponse.json({ success: true, result: await deletePreContract(actor, id) });
  } catch (error) { return apiError(error, "حذف پیش‌قرارداد"); }
}

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { actor, owner } = await requireStudioResourceAccess("contract", id, "studio.contract.view");
    const contract = await getContractById(id);
    const finance = await canAccessPermission(actor, "studio.finance.view", owner.coreProjectId);
    if (finance) return NextResponse.json({ success: true, contract });
    const { creditLimit: _creditLimit, paymentTermsDays: _paymentTermsDays, ...visibleDetails } = contract.customerDetails;
    return NextResponse.json({ success: true, contract: { ...redactContractFinance(contract), customerDetails: visibleDetails } });
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
      "studio.contract.edit",
    );
    const body = await req.json();
    if (body.items !== undefined || body.paidAmount !== undefined || body.paymentAccountId !== undefined) ({ actor } = await requireStudioResourceAccess("contract", id, "studio.finance.manage"));
    if (body.customerDetails && (body.customerDetails.creditLimit !== undefined || body.customerDetails.paymentTermsDays !== undefined)) ({ actor } = await requireStudioResourceAccess("contract", id, "studio.finance.manage"));
    const contract = await updateContract(actor, id, body);
    const finance = await canAccessPermission(actor, "studio.finance.view", contract.project.projectId);
    if (finance) return NextResponse.json({ success: true, contract });
    const { creditLimit: _creditLimit, paymentTermsDays: _paymentTermsDays, ...visibleDetails } = contract.customerDetails;
    return NextResponse.json({ success: true, contract: { ...redactContractFinance(contract), customerDetails: visibleDetails } });
  } catch (error) {
    return apiError(error, "ویرایش قرارداد");
  }
}
