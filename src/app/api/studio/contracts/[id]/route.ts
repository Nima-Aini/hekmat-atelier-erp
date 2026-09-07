import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/services/access";
import { apiError } from "@/lib/apiError";
import { updateStudioContract } from "@/services/studio/projectService";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("studio.projects.manage");
    const { id } = await params;
    const body = await req.json();

    const updated = await updateStudioContract(id, body);
    return NextResponse.json({ success: true, contract: updated });
  } catch (error) {
    return apiError(error, "به‌روزرسانی اطلاعات قرارداد");
  }
}
