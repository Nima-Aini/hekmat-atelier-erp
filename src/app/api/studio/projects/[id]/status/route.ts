import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/services/access";
import { apiError } from "@/lib/apiError";
import { updateStudioProjectStatus } from "@/services/studio/projectService";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("studio.projects.manage");
    const { id } = await params;
    const body = await req.json();

    if (!body.status) {
      return NextResponse.json(
        { success: false, error: "وضعیت جدید پروژه الزامی است." },
        { status: 400 }
      );
    }

    const updated = await updateStudioProjectStatus(id, body.status);
    return NextResponse.json({ success: true, project: updated });
  } catch (error) {
    return apiError(error, "تغییر وضعیت پروژه آتلیه");
  }
}
