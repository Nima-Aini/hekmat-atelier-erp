import crypto from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { atelierExpenseCategories } from "@/db/schema";
import { ApiError } from "@/lib/apiError";
import type { EmployeeContext } from "@/services/access";
import { logAuditEvent } from "@/services/audit";

export async function listExpenseCategories(includeInactive = false) {
  return db.select().from(atelierExpenseCategories).where(includeInactive ? undefined : eq(atelierExpenseCategories.active, true)).orderBy(asc(atelierExpenseCategories.sortOrder), asc(atelierExpenseCategories.title));
}

export async function saveExpenseCategory(actor: EmployeeContext, value: Record<string, unknown>, existingCode?: string) {
  const title = String(value.title || "").trim();
  if (!title || title.length > 120) throw new ApiError(400, "عنوان دسته هزینه الزامی است.");
  const sortOrder = Number(value.sortOrder || 0);
  if (!Number.isSafeInteger(sortOrder)) throw new ApiError(400, "ترتیب نمایش نامعتبر است.");
  return db.transaction(async tx => {
    // Existing legacy rows may use Persian labels as their primary key. They
    // remain editable, but an arbitrary unsafe key can never be introduced by
    // pretending it is an existing row.
    const requestedExistingCode = existingCode?.trim();
    const [before] = requestedExistingCode
      ? await tx.select().from(atelierExpenseCategories).where(eq(atelierExpenseCategories.code, requestedExistingCode)).for("update").limit(1)
      : [];
    if (requestedExistingCode && !before) throw new ApiError(404, "دسته هزینه برای ویرایش یافت نشد.");

    const generatedCode = String(value.code || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "")
      || `category_${crypto.createHash("sha256").update(title).digest("hex").slice(0, 12)}`;
    const code = before?.code || generatedCode;
    if (!before && !/^[a-z0-9_-]{2,80}$/.test(code)) throw new ApiError(400, "کد دسته هزینه نامعتبر است.");

    const [row] = before
      ? await tx.update(atelierExpenseCategories).set({ title, active: value.active !== false, sortOrder, updatedAt: new Date() }).where(eq(atelierExpenseCategories.code, code)).returning()
      : await tx.insert(atelierExpenseCategories).values({ code, title, active: value.active !== false, sortOrder }).returning();
    await logAuditEvent(before ? "EXPENSE_CATEGORY_UPDATED" : "EXPENSE_CATEGORY_CREATED", "atelier_expense_category", code, { before: before || null, after: row }, { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName }, tx);
    return row;
  });
}
