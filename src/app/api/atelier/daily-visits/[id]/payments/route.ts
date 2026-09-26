import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requirePermission } from "@/services/access";
import { recordAtelierReceipt } from "@/services/studio/financeCenter";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission("studio.daily_visits.manage");
    const { id } = await params;
    const body = await req.json();
    const payment = await recordAtelierReceipt(actor, { ...body, sourceType: "daily_visit", sourceId: id });
    return NextResponse.json({ success: true, payment }, { status: 201 });
  } catch (error) {
    return apiError(error, "ثبت پرداخت مراجعه روزانه");
  }
}
