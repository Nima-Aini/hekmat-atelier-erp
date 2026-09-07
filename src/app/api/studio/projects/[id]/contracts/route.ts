import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/services/access";
import { apiError } from "@/lib/apiError";
import { createStudioContract } from "@/services/studio/projectService";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("studio.contracts.create");
    const { id } = await params;
    const body = await req.json();

    const contract = await createStudioContract(id, body);
    return NextResponse.json({ success: true, contract }, { status: 201 });
  } catch (error) {
    return apiError(error, "ثبت قرارداد پروژه");
  }
}
