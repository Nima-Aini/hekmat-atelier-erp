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
    await requirePermission("expenses.view", expense.expense.projectId);

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
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "اطلاعات هزینه نامعتبر است.");
    const context = await requirePermission("expenses.edit");
    const updated = await db.transaction(async (tx) => {
    const [record] = await tx.select().from(expenses).where(eq(expenses.id, id)).for("update").limit(1);
    if (!record) throw new ApiError(404, "سند هزینه یافت نشد.");
    await requirePermission("expenses.edit", record.projectId);
    if (body.projectId !== undefined && body.projectId !== null && body.projectId !== "") { assertUuid(body.projectId); await requirePermission("expenses.edit", body.projectId); }
    if (record.status === "posted" || Number(record.paidAmount) > 0 || record.paymentId) throw new ApiError(409, "سند هزینه ثبت‌شده قابل ویرایش مستقیم نیست؛ اصلاح باید با سند برگشتی انجام شود.");

    const newAmount = body.amount !== undefined ? Number(body.amount) : Number(record.amount);
    if (newAmount <= 0 || !Number.isFinite(newAmount)) throw new ApiError(400, "مبلغ هزینه نامعتبر است.");
    const updatePayload: Partial<typeof expenses.$inferInsert> = {};
      if (body.title !== undefined && (typeof body.title !== "string" || !body.title.trim())) throw new ApiError(400, "عنوان هزینه الزامی است.");
      if (body.category !== undefined && typeof body.category !== "string") throw new ApiError(400, "دسته هزینه نامعتبر است.");
      if (body.description != null && typeof body.description !== "string") throw new ApiError(400, "توضیحات هزینه نامعتبر است.");
      if (body.title !== undefined) updatePayload.title = body.title.trim();
      if (body.category !== undefined) updatePayload.category = body.category;
      if (body.amount !== undefined) updatePayload.amount = newAmount.toString();
      if (body.projectId !== undefined) updatePayload.projectId = body.projectId || null;
      if (body.description !== undefined) updatePayload.description = body.description || null;
      if (body.expenseDate !== undefined) updatePayload.expenseDate = new Date(body.expenseDate);
    if (updatePayload.expenseDate && !Number.isFinite(+updatePayload.expenseDate)) throw new ApiError(400, "تاریخ هزینه نامعتبر است.");
    if (!Object.keys(updatePayload).length) throw new ApiError(400, "تغییری برای ثبت ارسال نشده است.");
    const [updated] = await tx.update(expenses).set(updatePayload).where(eq(expenses.id, id)).returning();

    await logAuditEvent("UPDATE", "expense", id, {
      title: updated.title,
      oldAmount: record.amount,
      newAmount,
    }, { userId: context.employeeId, employeeId: context.employeeId, userName: context.employeeName }, tx);
    return updated;
    });

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

    const existing = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(expenses).where(eq(expenses.id, id)).for("update").limit(1);
    if (!existing) throw new ApiError(404, "سند هزینه یافت نشد.");
    await requirePermission("expenses.delete", existing.projectId);
    if (existing.status === "posted" || Number(existing.paidAmount) > 0 || existing.paymentId) throw new ApiError(409, "سند هزینه ثبت‌شده قابل حذف نیست؛ برای اصلاح، سند برگشتی ثبت کنید.");
    await tx.delete(expenses).where(eq(expenses.id, id));
    await logAuditEvent("DELETE", "expense", id, { title: existing.title, amount: existing.amount }, { userId: context.employeeId, employeeId: context.employeeId, userName: context.employeeName }, tx);
    return existing;
    });
    return NextResponse.json({ success: true, message: `پیش‌نویس هزینه «${existing.title}» حذف شد.` });
  } catch (error: any) {
    const status = error.message?.includes("دسترسی") ? 403 : 500;
    return apiError(error);
  }
}
