import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/services/access";
import { apiError } from "@/lib/apiError";
import { assignPersonnelToProject } from "@/services/studio/projectService";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("studio.personnel.rates");
    const { id } = await params;
    const body = await req.json();

    const record = await assignPersonnelToProject(id, body);
    return NextResponse.json({ success: true, assignment: record }, { status: 201 });
  } catch (error) {
    return apiError(error, "تخصیص عوامل و محاسبه دستمزد پروژه");
  }
}
