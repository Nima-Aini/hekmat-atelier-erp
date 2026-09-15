import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requirePermission } from "@/services/access";
import { assignEquipmentToItem } from "@/services/studio/finalWorkflow";
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
