import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/services/access";
import { apiError } from "@/lib/apiError";
import {
  listProjectPayments,
  createStudioPayment,
  deleteStudioPayment,
} from "@/services/studio/projectService";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("studio.view");
    const { id } = await params;

    const payments = await listProjectPayments(id);
    return NextResponse.json({ success: true, payments });
  } catch (error) {
    return apiError(error, "دریافت لیست پرداختی‌های پروژه");
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("studio.projects.manage");
    const { id } = await params;
    const body = await req.json();

    const payment = await createStudioPayment(id, body);
    return NextResponse.json({ success: true, payment }, { status: 201 });
  } catch (error) {
    return apiError(error, "ثبت پرداختی جدید برای پروژه");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requirePermission("studio.projects.manage");
    const { searchParams } = new URL(req.url);
    const paymentId = searchParams.get("paymentId");

    if (!paymentId) {
      return NextResponse.json({ success: false, message: "شناسه پرداخت الزامی است." }, { status: 400 });
    }

    const res = await deleteStudioPayment(paymentId);
    return NextResponse.json(res);
  } catch (error) {
    return apiError(error, "حذف پرداختی پروژه");
  }
}
