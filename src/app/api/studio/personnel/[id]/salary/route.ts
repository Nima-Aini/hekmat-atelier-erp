import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { recordPersonnelSalary } from "@/services/studio/personnelService";
import { requireStudioGlobalAccess, requireStudioProjectAccess } from "@/services/studio/access";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const actor = body.studioProjectId
      ? (await requireStudioProjectAccess(body.studioProjectId, "studio.personnel.wage.manage")).actor
      : await requireStudioGlobalAccess("studio.personnel.wage.manage");

    const record = await recordPersonnelSalary({
      personnelId: id,
      ...body,
      actorId: actor.employeeId,
      actorName: actor.employeeName,
    });

    return NextResponse.json({ success: true, salaryRecord: record }, { status: 201 });
  } catch (error) {
    return apiError(error, "ثبت رکورد دستمزد");
  }
}
