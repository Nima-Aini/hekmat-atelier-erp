import { NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { canAccessPermission, getScopedProjectIds, requirePermission } from "@/services/access";
import { listContractCustomers } from "@/services/studio/finalInsights";

export async function GET() {
  try {
    const actor = await requirePermission("studio.view");
    return NextResponse.json({
      success: true,
      customers: await listContractCustomers(await getScopedProjectIds(), await canAccessPermission(actor, "studio.finance.view")),
    });
  } catch (error) {
    return apiError(error, "دریافت مشتریان قراردادها");
  }
}
