import { ApiError, apiError } from "@/lib/apiError";
import { pageNumber } from "@/lib/apiError";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { expenses, accounts, projects } from "@/db/schema";
import { desc, eq, sql, and } from "drizzle-orm";
import { logAuditEvent } from "@/services/audit";
import { requirePermission } from "@/services/access";
import { postCanonicalExpense } from "@/services/financial";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    
    const context = await requirePermission("expenses.view", projectId || undefined);

    const page = pageNumber(searchParams.get("page"), 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));
    const offset = (page - 1) * pageSize;

    const conditions = [];
    if (projectId && projectId.trim() !== "") {
      conditions.push(eq(expenses.projectId, projectId));
    }

    const list = await db
      .select({
        expense: expenses,
        accountName: accounts.name,
        projectName: projects.name,
      })
      .from(expenses)
      .leftJoin(accounts, eq(expenses.accountId, accounts.id))
      .leftJoin(projects, eq(expenses.projectId, projects.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt))
      .limit(pageSize)
      .offset(offset);

    let total = list.length;
    try {
      const countRes = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(expenses)
        .where(conditions.length ? and(...conditions) : undefined);
      total = Number(countRes[0]?.count ?? list.length);
    } catch {
      total = list.length;
    }

    const formatted = list.map(({ expense, accountName, projectName }) => ({
      ...expense,
      accountName: accountName || "-",
      projectName: projectName || "عمومی",
      amount: Number(expense.amount),
    }));

    return NextResponse.json({ success: true, expenses: formatted, pagination: { page, pageSize, total } });
  } catch (error: any) {
    console.error("GET /api/expenses error:", error);
    return apiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const context = await requirePermission("expenses.create", body.projectId || null);

    if (!body.title || !body.title.trim()) {
      return NextResponse.json({ success: false, error: "عنوان هزینه الزامی است." }, { status: 400 });
    }

    const amt = Number(body.amount);
    if (!amt || amt <= 0 || !isFinite(amt)) {
      return NextResponse.json({ success: false, error: "مبلغ هزینه باید بزرگ‌تر از صفر باشد." }, { status: 400 });
    }

    if (!body.accountId) throw new ApiError(400, "انتخاب حساب پرداخت الزامی است.");
    const key = String(body.idempotencyKey || req.headers.get("idempotency-key") || crypto.randomUUID());
    const result = await db.transaction((tx) => postCanonicalExpense(tx, {
      requestKey: `legacy-expense:${key}`, requestHash: crypto.createHash("sha256").update(JSON.stringify({ title: body.title, amount: amt, accountId: body.accountId, projectId: body.projectId || null })).digest("hex"),
      title: body.title.trim(), category: body.category || "other", amount: amt, projectId: body.projectId || null,
      accountId: body.accountId, employeeId: context.employeeId, expenseDate: body.expenseDate ? new Date(body.expenseDate) : new Date(),
      description: body.description?.trim() || body.notes?.trim() || null, paid: true,
    }, { userId: context.employeeId, employeeId: context.employeeId, userName: context.employeeName }));
    return NextResponse.json({ success: true, expense: result.expense, message: "سند هزینه با موفقیت ثبت شد." });
  } catch (error: any) {
    console.error("POST /api/expenses error:", error);
    return apiError(error);
  }
}
