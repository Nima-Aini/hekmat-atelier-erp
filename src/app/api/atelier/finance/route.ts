import { NextResponse } from "next/server";
import { ApiError, apiError, assertUuid } from "@/lib/apiError";
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
    const customerId = search.get("reportCustomer");
    const projectId = search.get("reportProject");
    const accountId = search.get("reportAccount");
    for (const id of [customerId, projectId, accountId]) if (id) assertUuid(id);
    const paymentType = search.get("reportPaymentType");
    if (paymentType && !/^[a-z0-9_]{1,60}$/.test(paymentType)) throw new ApiError(400, "نوع تراکنش معتبر نیست.");
    const data = await getAtelierFinanceCenter(await getScopedProjectIds(["studio.finance.view"]), true, { start, end, customerId, projectId, accountId, paymentType });
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
