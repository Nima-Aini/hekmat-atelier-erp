import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import {
  listProjectPayments,
  createStudioPayment,
  deleteStudioPayment,
} from "@/services/studio/projectService";
import { requireStudioProjectAccess, requireStudioResourceAccess } from "@/services/studio/access";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await requireStudioProjectAccess(id, "studio.finance.view");

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
    const { id } = await params;
    const { actor: context } = await requireStudioProjectAccess(id, "studio.finance.manage");
    const body = await req.json();

    const payment = await createStudioPayment(id, { ...body, idempotencyKey: req.headers.get("idempotency-key") || body.idempotencyKey, actorId: context.employeeId, authorName: context.employeeName });
    return NextResponse.json({ success: true, payment }, { status: 201 });
  } catch (error) {
    return apiError(error, "ثبت پرداختی جدید برای پروژه");
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const paymentId = searchParams.get("paymentId");

    if (!paymentId) {
      return NextResponse.json({ success: false, message: "شناسه پرداخت الزامی است." }, { status: 400 });
    }

    const { actor } = await requireStudioResourceAccess("payment", paymentId, "studio.finance.manage", id);

    const res = await deleteStudioPayment(paymentId, actor);
    return NextResponse.json(res);
  } catch (error) {
    return apiError(error, "حذف پرداختی پروژه");
  }
}
