import { NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { canAccessPermission, getScopedProjectIds, requirePermission } from "@/services/access";
import { getAtelierFinanceCenter } from "@/services/studio/financeCenter";

export async function GET() {
  try {
    const actor = await requirePermission("studio.finance.view");
    const data = await getAtelierFinanceCenter(await getScopedProjectIds(["studio.finance.view"]));
    const [canReports, canProfit] = await Promise.all([
      canAccessPermission(actor, "studio.finance.reports"),
      canAccessPermission(actor, "studio.finance.profit_view"),
    ]);
    return NextResponse.json({
      success: true,
      data: {
        ...data,
        reports: canReports ? data.reports : null,
        profitability: canProfit ? data.profitability : [],
        summary: canProfit ? data.summary : { ...data.summary, estimatedProfitThisMonth: null },
        access: { reports: canReports, profit: canProfit },
      },
    });
  } catch (error) { return apiError(error, "دریافت مرکز مالی آتلیه"); }
}
