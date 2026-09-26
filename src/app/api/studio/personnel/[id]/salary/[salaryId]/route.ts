import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import {
  updatePersonnelSalaryStatus,
  deletePersonnelSalaryRecord,
} from "@/services/studio/personnelService";
import { requireStudioResourceAccess } from "@/services/studio/access";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; salaryId: string }> }
) {
  try {
    const { id, salaryId } = await params;
    const { actor: context } = await requireStudioResourceAccess("salary", salaryId, "studio.personnel.wage.manage", undefined, id);
    const body = await req.json();

    const updated = await updatePersonnelSalaryStatus(
      salaryId,
      body.paymentStatus || body.status,
      body.settlementDate,
      { accountId: body.accountId, idempotencyKey: req.headers.get("idempotency-key") || body.idempotencyKey, actorId: context.employeeId, actorName: context.employeeName }
    );

    return NextResponse.json({ success: true, salaryRecord: updated });
  } catch (error) {
    return apiError(error, "بروزرسانی وضعیت دستمزد");
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; salaryId: string }> }
) {
  try {
    const { id, salaryId } = await params;
    await requireStudioResourceAccess("salary", salaryId, "studio.personnel.wage.manage", undefined, id);

    const result = await deletePersonnelSalaryRecord(salaryId);
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error, "حذف رکورد دستمزد");
  }
}
