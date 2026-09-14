import { NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { approveContract } from "@/services/studio/finalWorkflow";
import { requireStudioResourceAccess } from "@/services/studio/access";

export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { actor } = await requireStudioResourceAccess(
      "contract",
      id,
      "studio.finance.manage",
    );
    return NextResponse.json({
      success: true,
      contract: await approveContract(actor, id),
    });
  } catch (error) {
    return apiError(error, "تأیید قرارداد");
  }
}
