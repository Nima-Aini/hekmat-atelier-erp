import { ApiError, apiError, assertUuid, decimal } from "@/lib/apiError";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { accounts, payments, expenses, accountBalanceAdjustments } from "@/db/schema";
import { eq, desc, sql, and, ne } from "drizzle-orm";
import { requireAnyPermission } from "@/services/access";
import { logAuditEvent } from "@/services/audit";
const accountTypes = ["bank", "cash", "pos", "other", "receivable", "payable", "revenue", "cogs", "expense", "equity"];

function validateAccountText(body: Record<string, unknown>) {
  for (const [field, max] of [["name", 120], ["code", 50], ["bankName", 100], ["accountNumber", 100]] as const) {
    const value = body[field];
    if ((field === "name" || field === "code") && value === null) throw new ApiError(400, "نام و کد حساب نامعتبر است.");
    if (value != null && (typeof value !== "string" || value.length > max)) throw new ApiError(400, "اطلاعات متنی حساب نامعتبر است.");
  }
}

export async function GET(req: Request) {
  try {
    await requireAnyPermission(["studio.finance.view", "financial.view"]);
    const url = new URL(req.url);
    const type = url.searchParams.get("type");

    const conditions = [eq(accounts.status, "active")];
    if (type && type !== "all") {
      conditions.push(eq(accounts.type, type));
    }

    const rows = await db
      .select()
      .from(accounts)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(accounts.isDefault), desc(accounts.createdAt));

    const totalLiquidity = rows.reduce((sum, a) => sum + Number(a.balance || 0), 0);
    const totalBank = rows
      .filter((a) => a.type === "bank" || a.type === "pos")
      .reduce((sum, a) => sum + Number(a.balance || 0), 0);
    const totalCash = rows
      .filter((a) => a.type === "cash")
      .reduce((sum, a) => sum + Number(a.balance || 0), 0);

    return NextResponse.json({
      success: true,
      accounts: rows.map((a) => ({
        ...a,
        balance: Number(a.balance || 0),
      })),
      summary: {
        totalLiquidity,
        totalBank,
        totalCash,
        count: rows.length,
      },
    });
  } catch (error: any) {
    return apiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requireAnyPermission(["studio.finance.manage", "financial.edit"]);
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "اطلاعات حساب نامعتبر است.");
    validateAccountText(body);

    const { name, type = "bank", bankName, accountNumber, balance = 0, isDefault = false } = body;
    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ success: false, error: "نام حساب یا صندوق الزامی است." }, { status: 400 });
    }

    const validatedBalance = decimal(balance, "موجودی حساب", 2);
    if (Number(validatedBalance) < 0) {
      return NextResponse.json({ success: false, error: "موجودی حساب نمی‌تواند منفی باشد." }, { status: 400 });
    }
    if (!accountTypes.includes(type)) throw new ApiError(400, "نوع حساب نامعتبر است.");
    if (typeof isDefault !== "boolean") throw new ApiError(400, "وضعیت حساب پیش‌فرض نامعتبر است.");

    let code = body.code?.trim();
    if (!code) {
      const prefix = type === "cash" ? "CASH" : type === "pos" ? "POS" : "ACC";
      code = `${prefix}-${Date.now().toString().slice(-4)}`;
    }

    // Check duplicate code
    const [existingCode] = await db.select().from(accounts).where(eq(accounts.code, code)).limit(1);
    if (existingCode) {
      if (body.code) throw new ApiError(409, "کد حساب تکراری است.");
      code = `${code}-${Math.floor(Math.random() * 100)}`;
    }

    const newAccount = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('account-default', 0))`);
    // Serialize default changes and roll them back if creation or audit fails.
    if (isDefault) {
      await tx.update(accounts).set({ isDefault: false });
    }

    const [newAccount] = await tx
      .insert(accounts)
      .values({
        code,
        name: name.trim(),
        type,
        bankName: bankName?.trim() || null,
        accountNumber: accountNumber?.trim() || null,
        balance: validatedBalance,
        isDefault: Boolean(isDefault),
      })
      .returning();

    await logAuditEvent("CREATE", "account", newAccount.id, {
      name: newAccount.name,
      code: newAccount.code,
      type: newAccount.type,
      balance: newAccount.balance,
    }, { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName }, tx);
    return newAccount;
    });

    return NextResponse.json({
      success: true,
      account: { ...newAccount, balance: Number(newAccount.balance || 0) },
      message: `حساب «${newAccount.name}» با موفقیت ایجاد گردید.`,
    });
  } catch (error: any) {
    return apiError(error);
  }
}

export async function PUT(req: Request) {
  try {
    const actor = await requireAnyPermission(["studio.finance.manage", "financial.edit"]);
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "اطلاعات حساب نامعتبر است.");
    validateAccountText(body);
    const { id, name, code, type, bankName, accountNumber, balance, isDefault } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "شناسه حساب الزامی است." }, { status: 400 });
    }
    assertUuid(id);
    if (name !== undefined && (typeof name !== "string" || !name.trim())) throw new ApiError(400, "نام حساب الزامی است.");
    if (type !== undefined && !accountTypes.includes(type)) throw new ApiError(400, "نوع حساب نامعتبر است.");
    if (isDefault !== undefined && typeof isDefault !== "boolean") throw new ApiError(400, "وضعیت حساب پیش‌فرض نامعتبر است.");
    const validatedBalance = balance === undefined ? undefined : decimal(balance, "موجودی حساب", 2);
    const updated = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('account-default', 0))`);
    const [existing] = await tx.select().from(accounts).where(eq(accounts.id, id)).for("update").limit(1);
    if (!existing) {
      throw new ApiError(404, "حساب مورد نظر یافت نشد.");
    }
    if (isDefault && existing.status !== "active") throw new ApiError(409, "حساب بایگانی‌شده نمی‌تواند پیش‌فرض باشد.");

    if (code && code !== existing.code) {
      const [duplicate] = await tx
        .select()
        .from(accounts)
        .where(and(eq(accounts.code, code), ne(accounts.id, id)))
        .limit(1);
      if (duplicate) {
        throw new ApiError(409, "کد حساب تکراری است.");
      }
    }

    if (isDefault) {
      await tx.update(accounts).set({ isDefault: false }).where(ne(accounts.id, id));
    }

    const updateData: Partial<typeof accounts.$inferInsert> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (code !== undefined) updateData.code = code.trim();
    if (type !== undefined) updateData.type = type;
    if (bankName !== undefined) updateData.bankName = bankName?.trim() || null;
    if (accountNumber !== undefined) updateData.accountNumber = accountNumber?.trim() || null;
    if (balance !== undefined && Number(balance) !== Number(existing.balance)) {
      const [hasPayment] = await tx.select({ id: payments.id }).from(payments).where(eq(payments.accountId, id)).limit(1);
      const [hasAdjustment] = await tx.select({ id: accountBalanceAdjustments.id }).from(accountBalanceAdjustments).where(eq(accountBalanceAdjustments.accountId, id)).limit(1);
      if (hasPayment || hasAdjustment) throw new ApiError(409, "موجودی حساب دارای گردش مالی را نمی‌توان مستقیم تغییر داد.");
      if (Number(balance) < 0) {
        throw new ApiError(400, "موجودی حساب نمی‌تواند منفی باشد.");
      }
      updateData.balance = validatedBalance;
    }
    if (isDefault !== undefined) updateData.isDefault = Boolean(isDefault);

    if (!Object.keys(updateData).length) throw new ApiError(400, "تغییری برای ثبت ارسال نشده است.");
    const [updated] = await tx.update(accounts).set(updateData).where(eq(accounts.id, id)).returning();

    await logAuditEvent("UPDATE", "account", updated.id, {
      name: updated.name,
      code: updated.code,
      balance: updated.balance,
      isDefault: updated.isDefault,
    }, { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName }, tx);
    return updated;
    });

    return NextResponse.json({
      success: true,
      account: { ...updated, balance: Number(updated.balance || 0) },
      message: `اطلاعات حساب «${updated.name}» با موفقیت ویرایش شد.`,
    });
  } catch (error: any) {
    return apiError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const actor = await requireAnyPermission(["studio.finance.manage", "financial.delete"]);
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "شناسه حساب مشخص نشده است." }, { status: 400 });
    }
    assertUuid(id);

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('account-default', 0))`);
      const [account] = await tx.select().from(accounts).where(eq(accounts.id, id)).for("update").limit(1);
      if (!account) throw new ApiError(404, "حساب یافت نشد.");
      const [hasPayments] = await tx.select({ id: payments.id }).from(payments).where(eq(payments.accountId, id)).limit(1);
      const [hasExpenses] = await tx.select({ id: expenses.id }).from(expenses).where(eq(expenses.accountId, id)).limit(1);
      const [hasAdjustment] = await tx.select({ id: accountBalanceAdjustments.id }).from(accountBalanceAdjustments).where(eq(accountBalanceAdjustments.accountId, id)).limit(1);
      if (hasPayments || hasExpenses || hasAdjustment || Number(account.balance) !== 0) {
        const [archived] = await tx.update(accounts).set({ status: "archived", archivedAt: new Date(), isDefault: false }).where(eq(accounts.id, id)).returning();
        await logAuditEvent("ARCHIVE", "account", id, { name: account.name, code: account.code }, { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName }, tx);
        return { account: archived, archived: true };
      }
      const [deleted] = await tx.delete(accounts).where(eq(accounts.id, id)).returning();
      await logAuditEvent("DELETE", "account", id, { name: account.name, code: account.code }, { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName }, tx);
      return { account: deleted, archived: false };
    });

    return NextResponse.json({ success: true, archived: result.archived, message: result.archived ? `حساب «${result.account.name}» دارای سابقه مالی است و بایگانی شد.` : `حساب «${result.account.name}» با موفقیت حذف شد.` });
  } catch (error: any) {
    return apiError(error);
  }
}
