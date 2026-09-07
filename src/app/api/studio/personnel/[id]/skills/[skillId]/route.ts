import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/services/access";
import { apiError } from "@/lib/apiError";
import { deletePersonnelSkill } from "@/services/studio/personnelService";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; skillId: string }> }
) {
  try {
    await requirePermission("studio.personnel.manage");
    const { skillId } = await params;

    const deleted = await deletePersonnelSkill(skillId);
    return NextResponse.json({ success: true, skill: deleted });
  } catch (error) {
    return apiError(error, "حذف مهارت");
  }
}
