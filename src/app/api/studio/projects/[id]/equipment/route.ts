import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/services/access";
import { apiError } from "@/lib/apiError";
import { reserveEquipmentForProject } from "@/services/studio/projectService";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("studio.equipment.reserve");
    const { id } = await params;
    const body = await req.json();

    const reservation = await reserveEquipmentForProject(id, body);
    return NextResponse.json({ success: true, reservation }, { status: 201 });
  } catch (error) {
    return apiError(error, "رزرو تجهیز برای پروژه");
  }
}
