import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { addRentalToProject } from "@/services/studio/projectService";
import { requireStudioProjectAccess } from "@/services/studio/access";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { actor: context } = await requireStudioProjectAccess(id, "studio.finance.manage");
    const body = await req.json();

    const rental = await addRentalToProject(id, {
      ...body,
      idempotencyKey: req.headers.get("idempotency-key") || body.idempotencyKey,
      actorId: context.employeeId,
      authorName: context.employeeName,
    });
    return NextResponse.json({ success: true, rental }, { status: 201 });
  } catch (error) {
    return apiError(error, "ثبت تجهیز کرایه‌ای برای پروژه");
  }
}
