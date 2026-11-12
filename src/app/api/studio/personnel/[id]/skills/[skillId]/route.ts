import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { deletePersonnelSkill } from "@/services/studio/personnelService";
import { requireStudioResourceAccess } from "@/services/studio/access";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; skillId: string }> }
) {
  try {
    const { id, skillId } = await params;
    await requireStudioResourceAccess("skill", skillId, "studio.personnel.manage", undefined, id);

    const deleted = await deletePersonnelSkill(skillId);
    return NextResponse.json({ success: true, skill: deleted });
  } catch (error) {
    return apiError(error, "حذف مهارت");
  }
}
