import { ApiError, assertUuid } from "@/lib/apiError";
import { apiError } from "@/lib/apiError";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { expenses, accounts, projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logAuditEvent } from "@/services/audit";
import { requirePermission } from "@/services/access";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    assertUuid(id);
    await requirePermission("expenses.view");

    const [expense] = await db
      .select({
        expense: expenses,
        accountName: accounts.name,
        projectName: projects.name,
      })
      .from(expenses)
      .leftJoin(accounts, eq(expenses.accountId, accounts.id))
      .leftJoin(projects, eq(expenses.projectId, projects.id))
      .where(eq(expenses.id, id))
      .limit(1);

    if (!expense) {
      return NextResponse.json({ success: false, error: "سند هزینه یافت نشد." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      expense: {
        ...expense.expense,
        accountName: expense.accountName || "-",
        projectName: expense.projectName || "عمومی",
        amount: Number(expense.expense.amount),
      },
    });
  } catch (error: any) {
    const status = error.message?.includes("دسترسی") ? 403 : 500;
    return apiError(error);
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    assertUuid(id);
    const body = await req.json();
    const context = await requirePermission("expenses.edit");

    const [record] = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
    if (!record) throw new ApiError(404, "سند هزینه یافت نشد.");
    if (record.status === "posted" || Number(record.paidAmount) > 0 || record.paymentId) throw new ApiError(409, "سند هزینه ثبت‌شده قابل ویرایش مستقیم نیست؛ اصلاح باید با سند برگشتی انجام شود.");

    const newAmount = body.amount !== undefined ? Number(body.amount) : Number(record.amount);
    if (newAmount <= 0 || !Number.isFinite(newAmount)) throw new ApiError(400, "مبلغ هزینه نامعتبر است.");
    const updatePayload: Record<string, any> = {};
      if (body.title !== undefined) updatePayload.title = body.title.trim();
      if (body.category !== undefined) updatePayload.category = body.category;
      if (body.amount !== undefined) updatePayload.amount = newAmount.toString();
      if (body.projectId !== undefined) updatePayload.projectId = body.projectId || null;
      if (body.description !== undefined) updatePayload.description = body.description || null;
      if (body.expenseDate !== undefined) updatePayload.expenseDate = new Date(body.expenseDate);
    const [updated] = await db.update(expenses).set(updatePayload).where(eq(expenses.id, id)).returning();

    await logAuditEvent("UPDATE", "expense", id, {
      title: updated.title,
      oldAmount: record.amount,
      newAmount,
    }, { userId: context.employeeId, employeeId: context.employeeId, userName: context.employeeName });

    return NextResponse.json({
      success: true,
      expense: updated,
      message: `پیش‌نویس هزینه «${updated.title}» ویرایش شد.`,
    });
  } catch (error: any) {
    const status = error.message?.includes("دسترسی") ? 403 : error.message?.includes("موجودی") ? 400 : 500;
    return apiError(error);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    assertUuid(id);
    const context = await requirePermission("expenses.delete");

    const [existing] = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
    if (!existing) throw new ApiError(404, "سند هزینه یافت نشد.");
    if (existing.status === "posted" || Number(existing.paidAmount) > 0 || existing.paymentId) throw new ApiError(409, "سند هزینه ثبت‌شده قابل حذف نیست؛ برای اصلاح، سند برگشتی ثبت کنید.");
    await db.delete(expenses).where(eq(expenses.id, id));
    await logAuditEvent("DELETE", "expense", id, { title: existing.title, amount: existing.amount }, { userId: context.employeeId, employeeId: context.employeeId, userName: context.employeeName });
    return NextResponse.json({ success: true, message: `پیش‌نویس هزینه «${existing.title}» حذف شد.` });
  } catch (error: any) {
    const status = error.message?.includes("دسترسی") ? 403 : 500;
    return apiError(error);
  }
}
