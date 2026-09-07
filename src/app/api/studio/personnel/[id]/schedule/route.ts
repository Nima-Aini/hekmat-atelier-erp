import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/services/access";
import { apiError } from "@/lib/apiError";
import { getPersonnelSchedule } from "@/services/studio/personnelService";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("studio.view");
    const { id } = await params;
    const { searchParams } = new URL(req.url);

    const fromDate = searchParams.get("from") ? new Date(searchParams.get("from")!) : undefined;
    const toDate = searchParams.get("to") ? new Date(searchParams.get("to")!) : undefined;

    const schedule = await getPersonnelSchedule(id, fromDate, toDate);
    return NextResponse.json({ success: true, schedule });
  } catch (error) {
    return apiError(error, "دریافت برنامه کاری پرسنل");
  }
}
