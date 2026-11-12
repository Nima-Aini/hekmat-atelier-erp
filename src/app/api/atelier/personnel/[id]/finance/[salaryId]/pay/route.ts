import { NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requireStudioResourceAccess } from "@/services/studio/access";
import { settleAtelierObligation } from "@/services/studio/financeCenter";

export async function POST(req: Request, { params }: { params: Promise<{ id: string; salaryId: string }> }) {
  try {
    const { id, salaryId } = await params;
    const { actor } = await requireStudioResourceAccess("salary", salaryId, "studio.personnel.finance.pay", undefined, id);
    const input = await req.json();
    return NextResponse.json({ success: true, result: await settleAtelierObligation(actor, "personnel_wage", salaryId, input) });
  } catch (error) { return apiError(error, "پرداخت دستمزد"); }
}
