import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { createStudioContract } from "@/services/studio/projectService";
import { requireStudioProjectAccess } from "@/services/studio/access";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { actor: context } = await requireStudioProjectAccess(id, "studio.contract.manage");
    const body = await req.json();

    const contract = await createStudioContract(id, { ...body, idempotencyKey: req.headers.get("idempotency-key") || body.idempotencyKey, actorId: context.employeeId, authorName: context.employeeName });
    return NextResponse.json({ success: true, contract }, { status: 201 });
  } catch (error) {
    return apiError(error, "ثبت قرارداد پروژه");
  }
}
