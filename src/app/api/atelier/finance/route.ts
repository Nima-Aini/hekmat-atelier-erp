import { NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { getScopedProjectIds, requirePermission } from "@/services/access";
import { getAtelierFinanceCenter } from "@/services/studio/financeCenter";

export async function GET() {
  try {
    await requirePermission("studio.finance.view");
    return NextResponse.json({ success: true, data: await getAtelierFinanceCenter(await getScopedProjectIds()) });
  } catch (error) { return apiError(error, "دریافت مرکز مالی آتلیه"); }
}
