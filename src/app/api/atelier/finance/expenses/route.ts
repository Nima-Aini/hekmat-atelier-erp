import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requirePermission } from "@/services/access";
import { createAtelierExpense } from "@/services/studio/financeCenter";

export async function POST(req: NextRequest) {
  try {
    const actor = await requirePermission("studio.finance.manage");
    return NextResponse.json({ success: true, result: await createAtelierExpense(actor, await req.json()) }, { status: 201 });
  } catch (error) { return apiError(error, "ثبت هزینه آتلیه"); }
}
