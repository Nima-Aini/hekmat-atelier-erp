import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/services/access";
import { apiError } from "@/lib/apiError";
import {
  updatePersonnelSalaryStatus,
  deletePersonnelSalaryRecord,
} from "@/services/studio/personnelService";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; salaryId: string }> }
) {
  try {
    await requirePermission("studio.personnel.rates");
    const { salaryId } = await params;
    const body = await req.json();

    const updated = await updatePersonnelSalaryStatus(
      salaryId,
      body.paymentStatus || body.status,
      body.settlementDate
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
    await requirePermission("studio.personnel.rates");
    const { salaryId } = await params;

    const result = await deletePersonnelSalaryRecord(salaryId);
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error, "حذف رکورد دستمزد");
  }
}
