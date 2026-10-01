import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { updateStudioProjectStatus } from "@/services/studio/projectService";
import { requireStudioProjectAccess } from "@/services/studio/access";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { actor: context } = await requireStudioProjectAccess(id, "studio.projects.manage");
    const body = await req.json();

    if (!body.status) {
      return NextResponse.json(
        { success: false, error: "وضعیت جدید پروژه الزامی است." },
        { status: 400 }
      );
    }

    const updated = await updateStudioProjectStatus(id, body.status, context.employeeName, context.employeeId);
    return NextResponse.json({ success: true, project: updated });
  } catch (error) {
    return apiError(error, "تغییر وضعیت پروژه آتلیه");
  }
}
