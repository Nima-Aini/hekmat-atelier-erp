import { NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { canAccessPermission, getScopedProjectIds, requireAnyPermission } from "@/services/access";
import { listContractCustomers } from "@/services/studio/finalInsights";

export async function GET() {
  try {
    const actor = await requireAnyPermission(["studio.customers.view", "studio.view"]);
    const includeFinance = await canAccessPermission(actor, "studio.finance.view");
    return NextResponse.json({
      success: true,
      customers: await listContractCustomers(await getScopedProjectIds(["studio.customers.view", "studio.view"]), includeFinance, includeFinance ? await getScopedProjectIds(["studio.finance.view"]) : []),
    });
  } catch (error) {
    return apiError(error, "دریافت مشتریان قراردادها");
  }
}
