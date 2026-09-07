import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/services/access";
import { apiError } from "@/lib/apiError";
import { addRentalToProject } from "@/services/studio/projectService";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("studio.projects.manage");
    const { id } = await params;
    const body = await req.json();

    const rental = await addRentalToProject(id, body);
    return NextResponse.json({ success: true, rental }, { status: 201 });
  } catch (error) {
    return apiError(error, "ثبت تجهیز کرایه‌ای برای پروژه");
  }
}
