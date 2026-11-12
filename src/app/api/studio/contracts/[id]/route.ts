import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { updateStudioContract } from "@/services/studio/projectService";
import { requireStudioResourceAccess } from "@/services/studio/access";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { actor: context } = await requireStudioResourceAccess("contract", id, "studio.contract.manage");
    const body = await req.json();

    const updated = await updateStudioContract(id, { ...body, actorId: context.employeeId, authorName: context.employeeName });
    return NextResponse.json({ success: true, contract: updated });
  } catch (error) {
    return apiError(error, "به‌روزرسانی اطلاعات قرارداد");
  }
}
