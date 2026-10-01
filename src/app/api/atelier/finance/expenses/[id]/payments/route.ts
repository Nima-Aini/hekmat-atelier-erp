import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requirePermission } from "@/services/access";
import { settleAtelierExpense } from "@/services/studio/financeCenter";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission("studio.finance.manage"); const { id } = await params;
    return NextResponse.json({ success: true, payment: await settleAtelierExpense(actor, id, await req.json()) }, { status: 201 });
  } catch (error) { return apiError(error, "تسویه هزینه آتلیه"); }
}
