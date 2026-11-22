import { NextResponse } from "next/server";
import { ApiError, apiError } from "@/lib/apiError";
import { canAccessPermission, getScopedProjectIds, requirePermission } from "@/services/access";
import { parseReportDateParam } from "@/lib/dateUtils";
import { getAtelierFinanceCenter } from "@/services/studio/financeCenter";

export async function GET(request: Request) {
  try {
    const actor = await requirePermission("studio.finance.view");

    const [canReports, canProfit] = await Promise.all([
      canAccessPermission(actor, "studio.finance.reports"),
      canAccessPermission(actor, "studio.finance.profit_view"),
    ]);
    const search = request ? new URL(request.url).searchParams : new URLSearchParams();
    const from = search.get("reportFrom");
    const until = search.get("reportTo");
    const start = parseReportDateParam(from);
    const end = parseReportDateParam(until, true);
    if ((from && !start) || (until && !end) || (start && end && start > end)) {
      throw new ApiError(400, "بازه تاریخ گزارش معتبر نیست.");
    }
    const data = await getAtelierFinanceCenter(await getScopedProjectIds(["studio.finance.view"]), true, { start, end });
    const reports = canReports ? {
      ...data.reports,
      totals: { ...data.reports.totals, estimatedContractProfit: canProfit ? data.reports.totals.estimatedContractProfit : null },
      profitByProjectType: canProfit ? data.reports.profitByProjectType : [],
    } : null;
    return NextResponse.json({
      success: true,
      data: {
        ...data,
        reports,
        profitability: canProfit ? data.profitability : [],
        summary: canProfit ? data.summary : { ...data.summary, estimatedProfitThisMonth: null },
        access: { reports: canReports, profit: canProfit },
      },
    });
  } catch (error) { return apiError(error, "دریافت مرکز مالی آتلیه"); }
}
