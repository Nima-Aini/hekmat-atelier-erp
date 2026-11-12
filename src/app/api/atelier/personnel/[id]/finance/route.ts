import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requirePermission, canAccessPermission } from "@/services/access";
import { getPersonnelFinancialFile } from "@/services/studio/personnelFinance";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission("studio.personnel.finance.view");
    const { id } = await params;
    const query = new URL(req.url).searchParams;
    const from = query.get("from") ? new Date(query.get("from")!) : undefined;
    const to = query.get("to") ? new Date(query.get("to")!) : undefined;
    return NextResponse.json({ success: true, canPay: await canAccessPermission(actor, "studio.personnel.finance.pay"), file: await getPersonnelFinancialFile(id, from, to, actor) });
  } catch (error) {
    return apiError(error, "دریافت پرونده مالی پرسنل");
  }
}
