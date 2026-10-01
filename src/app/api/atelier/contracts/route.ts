import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { canAccessPermission, getScopedProjectIds, requirePermission } from "@/services/access";
import { redactContractFinance } from "@/services/studio/financialPrivacy";
import {
  createPendingContract,
  listContracts,
} from "@/services/studio/finalWorkflow";

export async function GET(req: NextRequest) {
  try {
    const actor = await requirePermission("studio.contract.view");
    const value = new URL(req.url).searchParams.get("status");
    const status =
      value === "pending" || value === "approved" ? value : undefined;
    const contracts = await listContracts(status, await getScopedProjectIds(["studio.contract.view"]));
    const visible = await Promise.all(contracts.map(async (contract) => await canAccessPermission(actor, "studio.finance.view", contract.project.projectId) ? contract : redactContractFinance(contract)));
    return NextResponse.json({
      success: true,
      contracts: visible,
    });
  } catch (error) {
    return apiError(error, "دریافت قراردادها");
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requirePermission("studio.contract.create");
    const body = await req.json();
    if (Number(body.paidAmount || body.depositAmount || 0) > 0) await requirePermission("studio.finance.create_receipt");
    const contract = await createPendingContract(actor, {
      ...body,
      idempotencyKey: req.headers.get("idempotency-key") || body.idempotencyKey,
    });
    return NextResponse.json({ success: true, contract }, { status: 201 });
  } catch (error) {
    return apiError(error, "ثبت قرارداد جدید");
  }
}
