import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requirePermission } from "@/services/access";
import {
  listDefaultWages,
  saveDefaultWage,
} from "@/services/studio/finalWorkflow";
export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("studio.personnel.wage.view");
    const { id } = await params;
    return NextResponse.json({
      success: true,
      wages: await listDefaultWages(id),
    });
  } catch (error) {
    return apiError(error, "دریافت دستمزدهای پیش‌فرض");
  }
}
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requirePermission("studio.personnel.manage");
    const { id } = await params;
    const body = await req.json();
    return NextResponse.json({
      success: true,
      wage: await saveDefaultWage(actor, id, body.workTitle, body.amount),
    });
  } catch (error) {
    return apiError(error, "ثبت دستمزد پیش‌فرض");
  }
}
