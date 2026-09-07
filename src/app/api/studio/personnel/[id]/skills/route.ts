import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/services/access";
import { apiError } from "@/lib/apiError";
import { addPersonnelSkill } from "@/services/studio/personnelService";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("studio.personnel.manage");
    const { id } = await params;
    const body = await req.json();

    const skill = await addPersonnelSkill(id, body);
    return NextResponse.json({ success: true, skill }, { status: 201 });
  } catch (error) {
    return apiError(error, "ثبت مهارت برای پرسنل");
  }
}
