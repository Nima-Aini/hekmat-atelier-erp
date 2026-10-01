import { NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { canAccessPermission, getScopedProjectIds, requireAnyPermission } from "@/services/access";
import { listContractCustomers } from "@/services/studio/finalInsights";

export async function GET() {
  try {
    const actor = await requireAnyPermission(["studio.customers.view", "studio.view"]);
    const includeFinance = await canAccessPermission(actor, "studio.finance.view");
    const editableProjectIds = actor.permissions.has("*") ? null : await getScopedProjectIds(["studio.customers.edit"]);
    return NextResponse.json({
      success: true,
      customers: await listContractCustomers(await getScopedProjectIds(["studio.customers.view", "studio.view"]), includeFinance, includeFinance ? await getScopedProjectIds(["studio.finance.view"]) : [], editableProjectIds),
    });
  } catch (error) {
    return apiError(error, "دریافت مشتریان قراردادها");
  }
}
