import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/services/access";
import { apiError } from "@/lib/apiError";
import { recordPersonnelSalary } from "@/services/studio/personnelService";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("studio.personnel.rates");
    const { id } = await params;
    const body = await req.json();

    const record = await recordPersonnelSalary({
      personnelId: id,
      ...body,
    });

    return NextResponse.json({ success: true, salaryRecord: record }, { status: 201 });
  } catch (error) {
    return apiError(error, "ثبت رکورد دستمزد");
  }
}
