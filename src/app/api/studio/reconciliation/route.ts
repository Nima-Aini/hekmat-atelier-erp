import { NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { getScopedProjectIds, requirePermission } from "@/services/access";
import { getStudioReconciliationReport } from "@/services/studio/reconciliation";

export async function GET() {
  try {
    await requirePermission("studio.finance.view");
    const report = await getStudioReconciliationReport(await getScopedProjectIds());
    return NextResponse.json({ success: true, report });
  } catch (error) { return apiError(error, "گزارش تطبیق مالی آتلیه"); }
}
