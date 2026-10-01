import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { reserveEquipmentForProject } from "@/services/studio/projectService";
import { requireStudioProjectAccess } from "@/services/studio/access";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { actor } = await requireStudioProjectAccess(id, "studio.equipment.reserve");
    const body = await req.json();

    const reservation = await reserveEquipmentForProject(id, { ...body, actorId: actor.employeeId, authorName: actor.employeeName });
    return NextResponse.json({ success: true, reservation }, { status: 201 });
  } catch (error) {
    return apiError(error, "رزرو تجهیز برای پروژه");
  }
}
