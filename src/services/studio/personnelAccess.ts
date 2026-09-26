import { db } from "@/db";
import { employeeAccounts, employeePermissions, employees, permissions, roles, studioPersonnel } from "@/db/schema";
import { ApiError, assertUuid } from "@/lib/apiError";
import { hashPassword } from "@/services/employeeAuth";
import { logAuditEvent } from "@/services/audit";
import type { EmployeeContext } from "@/services/access";
import { and, asc, eq, inArray } from "drizzle-orm";

export const PERSONNEL_PERMISSION_CODES = [
  "studio.dashboard.view", "studio.contract.view", "studio.contract.manage", "studio.daily_visits.view", "studio.daily_visits.manage",
  "studio.reservations.view", "studio.reservations.manage", "studio.planning.view", "studio.planning.manage", "studio.calendar.view",
  "studio.customers.view", "studio.personnel.view", "studio.personnel.manage", "studio.equipment.view", "studio.equipment.manage",
  "studio.finance.view", "studio.finance.manage", "studio.notifications.view", "ai.view", "settings.view",
] as const;

export async function getPersonnelAccess(personnelId: string) {
  assertUuid(personnelId);
  const [person] = await db.select().from(studioPersonnel).where(eq(studioPersonnel.id, personnelId)).limit(1);
  if (!person) throw new ApiError(404, "پرسنل یافت نشد.");
  const account = person.employeeId ? (await db.select({ username: employeeAccounts.username, status: employeeAccounts.status }).from(employeeAccounts).where(eq(employeeAccounts.employeeId, person.employeeId)).limit(1))[0] : null;
  const granted = person.employeeId ? await db.select({ code: permissions.code }).from(employeePermissions).innerJoin(permissions, eq(permissions.id, employeePermissions.permissionId)).where(and(eq(employeePermissions.employeeId, person.employeeId), eq(employeePermissions.granted, true))) : [];
  const available = await db.select({ code: permissions.code, name: permissions.name }).from(permissions).where(inArray(permissions.code, [...PERSONNEL_PERMISSION_CODES])).orderBy(asc(permissions.name));
  return { account, permissions: granted.map((row) => row.code), available };
}

export async function savePersonnelAccess(actor: EmployeeContext, personnelId: string, value: Record<string, unknown>) {
  assertUuid(personnelId);
  return db.transaction(async (tx) => {
    const [person] = await tx.select().from(studioPersonnel).where(eq(studioPersonnel.id, personnelId)).for("update").limit(1);
    if (!person) throw new ApiError(404, "پرسنل یافت نشد.");
    if (person.employeeId && person.employeeId === actor.employeeId) throw new ApiError(403, "تغییر دسترسی حساب خودتان از این بخش مجاز نیست.");
    let employeeId = person.employeeId;
    if (!employeeId) {
      const [employee] = await tx.insert(employees).values({ code: `AT-PER-${person.id.slice(0, 8).toUpperCase()}`, name: person.fullName, mobile: person.mobile, cooperationType: person.personnelType, role: "atelier_personnel", status: person.status === "active" ? "active" : "inactive", offboardingStage: "active", baseSalary: person.fixedSalary }).returning();
      employeeId = employee.id;
      await tx.update(studioPersonnel).set({ employeeId, updatedAt: new Date() }).where(eq(studioPersonnel.id, person.id));
    }
    const requested = Array.isArray(value.permissions) ? value.permissions.filter((code): code is string => typeof code === "string") : [];
    if (requested.some((code) => !PERSONNEL_PERMISSION_CODES.includes(code as any))) throw new ApiError(400, "دسترسی نامعتبر است.");
    const [role] = await tx.select().from(roles).where(eq(roles.code, "atelier_personnel")).limit(1);
    if (!role) throw new ApiError(500, "نقش پرسنل آتلیه آماده نیست.");
    const [existing] = await tx.select().from(employeeAccounts).where(eq(employeeAccounts.employeeId, employeeId)).limit(1);
    const username = String(value.username || existing?.username || "").trim();
    if (!username) throw new ApiError(400, "نام کاربری الزامی است.");
    const password = typeof value.password === "string" ? value.password : "";
    if (!existing && password.length < 10) throw new ApiError(400, "رمز عبور اولیه باید حداقل ۱۰ نویسه باشد.");
    if (existing) {
      const disabling = value.status === "inactive";
      await tx.update(employeeAccounts).set({ username, status: disabling ? "inactive" : "active", roleId: role.id, ...((password || disabling) ? { ...(password ? { passwordHash: hashPassword(password) } : {}), sessionInvalidBefore: new Date() } : {}), updatedAt: new Date() }).where(eq(employeeAccounts.id, existing.id));
    } else {
      await tx.insert(employeeAccounts).values({ employeeId, username, passwordHash: hashPassword(password), roleId: role.id, status: value.status === "inactive" ? "inactive" : "active" });
    }
    await tx.delete(employeePermissions).where(eq(employeePermissions.employeeId, employeeId));
    if (requested.length) {
      const rows = await tx.select().from(permissions).where(inArray(permissions.code, requested));
      await tx.insert(employeePermissions).values(rows.map((permission) => ({ employeeId: employeeId!, permissionId: permission.id, granted: true })));
    }
    await logAuditEvent("PERSONNEL_ACCESS_UPDATED", "studio_personnel", personnelId, { employeeId, permissions: requested, accountStatus: value.status === "inactive" ? "inactive" : "active", passwordChanged: Boolean(password) }, { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName }, tx);
    return { account: { username, status: value.status === "inactive" ? "inactive" : "active" }, permissions: requested };
  });
}
