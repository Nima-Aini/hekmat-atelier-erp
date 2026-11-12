import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requirePermission } from "@/services/access";
import { assignPersonnelToItem, deletePersonnelAssignment, updatePersonnelAssignment } from "@/services/studio/finalWorkflow";
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  try {
    const actor = await requirePermission("studio.planning.manage");
    const { itemId } = await params;
    return NextResponse.json(
      {
        success: true,
        assignment: await assignPersonnelToItem(
          actor,
          itemId,
          await req.json(),
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error, "تخصیص پرسنل");
  }
}
export async function PUT(req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  try { const actor = await requirePermission("studio.planning.manage"); const { itemId } = await params; const body = await req.json(); return NextResponse.json({ success: true, assignment: await updatePersonnelAssignment(actor, itemId, String(body.assignmentId || ""), body) }); }
  catch (error) { return apiError(error, "ویرایش تخصیص پرسنل"); }
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  try { const actor = await requirePermission("studio.planning.manage"); const { itemId } = await params; const body = await req.json(); return NextResponse.json({ success: true, assignment: await deletePersonnelAssignment(actor, itemId, String(body.assignmentId || "")) }); }
  catch (error) { return apiError(error, "حذف تخصیص پرسنل"); }
}
