import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requirePermission } from "@/services/access";
import { recordAtelierReceipt } from "@/services/studio/financeCenter";

export async function POST(req: NextRequest) {
  try {
    const actor = await requirePermission("studio.finance.manage");
    return NextResponse.json({ success: true, payment: await recordAtelierReceipt(actor, await req.json()) }, { status: 201 });
  } catch (error) { return apiError(error, "ثبت دریافت آتلیه"); }
}
