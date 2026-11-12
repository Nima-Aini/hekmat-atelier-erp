import { NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requireStudioResourceAccess } from "@/services/studio/access";
import { cancelContract, getContractCancellationPreview } from "@/services/studio/contractLifecycle";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { actor } = await requireStudioResourceAccess("contract", id, "studio.contract.cancel");
    return NextResponse.json({ success: true, preview: await getContractCancellationPreview(actor, id) });
  } catch (error) { return apiError(error, "پیش‌نمایش ابطال قرارداد"); }
}
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { actor } = await requireStudioResourceAccess("contract", id, "studio.contract.cancel");
    return NextResponse.json({ success: true, result: await cancelContract(actor, id, await req.json()), message: "قرارداد باطل و برگشت وجه در سیستم مالی ثبت شد." });
  } catch (error) { return apiError(error, "ابطال قرارداد"); }
}
