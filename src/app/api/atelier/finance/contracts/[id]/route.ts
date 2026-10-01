import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requirePermission } from "@/services/access";
import { updateContractFinance } from "@/services/studio/financeCenter";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission("studio.finance.manage");
    const { id } = await params;
    return NextResponse.json({ success: true, finance: await updateContractFinance(actor, id, await req.json()) });
  } catch (error) { return apiError(error, "اصلاح پرونده مالی قرارداد"); }
}
