import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requirePermission } from "@/services/access";
import { assignEquipmentToItem, deleteEquipmentAssignment, updateEquipmentAssignment } from "@/services/studio/finalWorkflow";
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
        reservation: await assignEquipmentToItem(
          actor,
          itemId,
          await req.json(),
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error, "تخصیص تجهیزات");
  }
}
export async function PUT(req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  try { const actor = await requirePermission("studio.planning.manage"); const { itemId } = await params; const body = await req.json(); return NextResponse.json({ success: true, reservation: await updateEquipmentAssignment(actor, itemId, String(body.assignmentId || ""), body) }); }
  catch (error) { return apiError(error, "ویرایش تخصیص تجهیزات"); }
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  try { const actor = await requirePermission("studio.planning.manage"); const { itemId } = await params; const body = await req.json(); return NextResponse.json({ success: true, reservation: await deleteEquipmentAssignment(actor, itemId, String(body.assignmentId || "")) }); }
  catch (error) { return apiError(error, "حذف تخصیص تجهیزات"); }
}
