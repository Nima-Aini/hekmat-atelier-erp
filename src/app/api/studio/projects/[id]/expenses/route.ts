import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import {
  listProjectExpenses,
  createStudioExpense,
  deleteStudioExpense,
} from "@/services/studio/projectService";
import { requireStudioProjectAccess, requireStudioResourceAccess } from "@/services/studio/access";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await requireStudioProjectAccess(id, "studio.finance.view");

    const expenses = await listProjectExpenses(id);
    return NextResponse.json({ success: true, expenses });
  } catch (error) {
    return apiError(error, "دریافت فهرست هزینه‌های پروژه");
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

    const expense = await createStudioExpense(id, { ...body, idempotencyKey: req.headers.get("idempotency-key") || body.idempotencyKey, actorId: context.employeeId, authorName: context.employeeName });
    return NextResponse.json({ success: true, expense }, { status: 201 });
  } catch (error) {
    return apiError(error, "ثبت هزینه جدید برای پروژه");
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const expenseId = searchParams.get("expenseId");

    if (!expenseId) {
      return NextResponse.json({ success: false, message: "شناسه هزینه الزامی است." }, { status: 400 });
    }

    const { actor } = await requireStudioResourceAccess("expense", expenseId, "studio.finance.manage", id);

    const res = await deleteStudioExpense(expenseId, actor);
    return NextResponse.json(res);
  } catch (error) {
    return apiError(error, "حذف هزینه پروژه");
  }
}
