import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiError } from "@/lib/apiError";
import { requirePermission } from "@/services/access";
import { settleAtelierObligation } from "@/services/studio/financeCenter";

export async function POST(req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  try {
    const actor = await requirePermission("studio.finance.manage"); const { type, id } = await params;
    if (type !== "personnel_wage" && type !== "rental") throw new ApiError(400, "نوع بدهی نامعتبر است.");
    return NextResponse.json({ success: true, result: await settleAtelierObligation(actor, type, id, await req.json()) }, { status: 201 });
  } catch (error) { return apiError(error, "تسویه بدهی آتلیه"); }
}
