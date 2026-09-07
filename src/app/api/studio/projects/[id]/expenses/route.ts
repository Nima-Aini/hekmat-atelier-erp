import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/services/access";
import { apiError } from "@/lib/apiError";
import {
  listProjectExpenses,
  createStudioExpense,
  deleteStudioExpense,
} from "@/services/studio/projectService";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("studio.view");
    const { id } = await params;

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
    await requirePermission("studio.projects.manage");
    const { id } = await params;
    const body = await req.json();

    const expense = await createStudioExpense(id, body);
    return NextResponse.json({ success: true, expense }, { status: 201 });
  } catch (error) {
    return apiError(error, "ثبت هزینه جدید برای پروژه");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requirePermission("studio.projects.manage");
    const { searchParams } = new URL(req.url);
    const expenseId = searchParams.get("expenseId");

    if (!expenseId) {
      return NextResponse.json({ success: false, message: "شناسه هزینه الزامی است." }, { status: 400 });
    }

    const res = await deleteStudioExpense(expenseId);
    return NextResponse.json(res);
  } catch (error) {
    return apiError(error, "حذف هزینه پروژه");
  }
}
