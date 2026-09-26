import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { assignPersonnelToProject } from "@/services/studio/projectService";
import { requireStudioProjectAccess } from "@/services/studio/access";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { actor } = await requireStudioProjectAccess(id, "studio.personnel.wage.manage");
    const body = await req.json();

    const record = await assignPersonnelToProject(id, { ...body, actorId: actor.employeeId, authorName: actor.employeeName });
    return NextResponse.json({ success: true, assignment: record }, { status: 201 });
  } catch (error) {
    return apiError(error, "تخصیص عوامل و محاسبه دستمزد پروژه");
  }
}
