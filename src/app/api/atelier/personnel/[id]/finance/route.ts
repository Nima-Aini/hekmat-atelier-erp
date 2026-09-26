import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requireAnyPermission } from "@/services/access";
import { getPersonnelFinancialFile } from "@/services/studio/personnelFinance";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAnyPermission(["studio.personnel.view", "studio.personnel.manage", "studio.finance.view", "studio.view"]);
    const { id } = await params;
    const query = new URL(req.url).searchParams;
    const from = query.get("from") ? new Date(query.get("from")!) : undefined;
    const to = query.get("to") ? new Date(query.get("to")!) : undefined;
    return NextResponse.json({ success: true, file: await getPersonnelFinancialFile(id, from, to) });
  } catch (error) {
    return apiError(error, "دریافت پرونده مالی پرسنل");
  }
}
