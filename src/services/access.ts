import { ApiError } from "@/lib/apiError";
import { cookies } from "next/headers";
import { db } from "@/db";
import { employeeAccounts, employees, employeeProjectAssignments, roles } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { verifySessionDetails } from "@/services/employeeAuth";
import { employeePermissionSet } from "@/services/partner";

export type EmployeeContext = { employeeId: string; employeeName: string; permissions: Set<string>; roleCode?: string };

export async function canAccessPermission(context: EmployeeContext, permission: string, projectId?: string | null) {
  if (context.permissions.has("*")) return true;
  const roleAllows = context.permissions.has(permission);
  if (!projectId) return roleAllows;
  const [assignment] = await db
    .select({ permissionSet: employeeProjectAssignments.permissionSet })
    .from(employeeProjectAssignments)
    .where(and(eq(employeeProjectAssignments.employeeId, context.employeeId), eq(employeeProjectAssignments.projectId, projectId), eq(employeeProjectAssignments.status, "active")))
    .limit(1);
  if (!assignment) return false;
  const scoped = (assignment.permissionSet || {}) as Record<string, unknown>;
  if (scoped[permission] === false) return false;
  return scoped[permission] === true || roleAllows;
}

export async function getEmployeeContext(): Promise<EmployeeContext | null> {
  try {
    const jar = await cookies();
    const raw = jar.get("employee_session")?.value;
    if (!raw) return null;
    const session = verifySessionDetails(raw);
    if (!session) return null;
    const employeeId = session.employeeId;
    const [row] = await db
      .select({
        accountStatus: employeeAccounts.status,
        roleId: employeeAccounts.roleId,
        employeeStatus: employees.status,
        offboardingStage: employees.offboardingStage,
        employeeName: employees.name,
        sessionInvalidBefore: employeeAccounts.sessionInvalidBefore,
      })
      .from(employeeAccounts)
      .innerJoin(employees, eq(employeeAccounts.employeeId, employees.id))
      .where(eq(employeeAccounts.employeeId, employeeId))
      .limit(1);
    if (!row || row.accountStatus !== "active" || row.employeeStatus !== "active" || (row.offboardingStage && row.offboardingStage !== "active") || (row.sessionInvalidBefore && session.issuedAt <= row.sessionInvalidBefore)) {
      return null;
    }
    const role = row.roleId
      ? (await db.select({ code: roles.code }).from(roles).where(eq(roles.id, row.roleId)).limit(1))[0]
      : null;
    const permissions = new Set((await employeePermissionSet(employeeId)).map((p) => p.code));
    return { employeeId, employeeName: row.employeeName, permissions, roleCode: role?.code };
  } catch (err) {
    console.error("getEmployeeContext error:", err);
    return null;
  }
}

export async function getScopedProjectIds() {
  const context = await getEmployeeContext();
  if (!context) throw new ApiError(401, "ابتدا وارد حساب کاربری شوید.");
  if (context.permissions.has("*")) return null;
  const rows = await db.select({ projectId: employeeProjectAssignments.projectId }).from(employeeProjectAssignments).where(and(eq(employeeProjectAssignments.employeeId, context.employeeId), eq(employeeProjectAssignments.status, "active")));
  return rows.map((r) => r.projectId);
}

export async function requirePermission(permission: string, projectId?: string | null) {
  const context = await getEmployeeContext();
  if (!context) {
    throw new ApiError(401, "دسترسی غیرمجاز: لطفاً ابتدا وارد حساب کاربری خود شوید.");
  }
  if (await canAccessPermission(context, permission, projectId)) return context;
  console.warn("authorization.denied", { employeeId: context.employeeId, permission, projectId: projectId || null });
  if (projectId) throw new ApiError(403, "دسترسی شما به این پروژه یا عملیات مجاز نیست.", "PROJECT_SCOPE_FORBIDDEN");
  throw new ApiError(403, `دسترسی موردنیاز برای این عملیات وجود ندارد: ${permission}`, "PERMISSION_REQUIRED");
}
