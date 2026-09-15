import { db } from "@/db";
import {
  equipmentReservations,
  personnelSalaryRecords,
  personnelSkills,
  rentalEquipment,
  studioCalendarEvents,
  studioCustomers,
  studioContracts,
  studioNotifications,
  studioProductionPlans,
  studioProductionSteps,
  studioProjectExpenses,
  studioProjectPayments,
  studioProjects,
  studioTasks,
} from "@/db/schema";
import { ApiError, assertUuid } from "@/lib/apiError";
import { canAccessPermission, getEmployeeContext, getScopedProjectIds, requirePermission, type EmployeeContext } from "@/services/access";
import { eq } from "drizzle-orm";

export type StudioScopedResource =
  | "contract" | "payment" | "expense" | "salary" | "rental"
  | "reservation" | "calendar" | "production_plan" | "production_step"
  | "task" | "notification" | "skill";

export interface StudioResourceOwner {
  studioProjectId: string | null;
  coreProjectId: string | null;
  parentId?: string | null;
}

async function projectOwner(studioProjectId: string | null): Promise<StudioResourceOwner> {
  if (!studioProjectId) return { studioProjectId: null, coreProjectId: null };
  const [project] = await db.select({ coreProjectId: studioProjects.projectId }).from(studioProjects).where(eq(studioProjects.id, studioProjectId)).limit(1);
  if (!project) throw new ApiError(404, "منبع پروژه آتلیه یافت نشد.", "STUDIO_RESOURCE_NOT_FOUND");
  return { studioProjectId, coreProjectId: project.coreProjectId };
}

export async function resolveStudioProjectOwner(studioProjectId: string) {
  assertUuid(studioProjectId);
  return projectOwner(studioProjectId);
}

export async function resolveStudioResourceOwner(type: StudioScopedResource, id: string): Promise<StudioResourceOwner> {
  assertUuid(id);
  let studioProjectId: string | null = null;
  let parentId: string | null = null;
  if (type === "contract") studioProjectId = (await one(studioContracts.id, studioContracts.studioProjectId, id, "قرارداد")).studioProjectId;
  else if (type === "payment") studioProjectId = (await one(studioProjectPayments.id, studioProjectPayments.studioProjectId, id, "پرداخت")).studioProjectId;
  else if (type === "expense") studioProjectId = (await one(studioProjectExpenses.id, studioProjectExpenses.studioProjectId, id, "هزینه")).studioProjectId;
  else if (type === "salary") {
    const row = await oneWithParent(personnelSalaryRecords.id, personnelSalaryRecords.studioProjectId, personnelSalaryRecords.personnelId, id, "دستمزد");
    studioProjectId = row.studioProjectId; parentId = row.parentId;
  } else if (type === "rental") studioProjectId = (await one(rentalEquipment.id, rentalEquipment.studioProjectId, id, "رنتال")).studioProjectId;
  else if (type === "reservation") {
    const row = await oneWithParent(equipmentReservations.id, equipmentReservations.studioProjectId, equipmentReservations.equipmentId, id, "رزرو تجهیز");
    studioProjectId = row.studioProjectId; parentId = row.parentId;
  } else if (type === "calendar") studioProjectId = (await one(studioCalendarEvents.id, studioCalendarEvents.studioProjectId, id, "رویداد تقویم")).studioProjectId;
  else if (type === "production_plan") studioProjectId = (await one(studioProductionPlans.id, studioProductionPlans.studioProjectId, id, "برنامه تولید")).studioProjectId;
  else if (type === "production_step") {
    const [row] = await db.select({ studioProjectId: studioProductionPlans.studioProjectId, parentId: studioProductionSteps.planId }).from(studioProductionSteps).innerJoin(studioProductionPlans, eq(studioProductionSteps.planId, studioProductionPlans.id)).where(eq(studioProductionSteps.id, id)).limit(1);
    if (!row) throw notFound("مرحله تولید"); studioProjectId = row.studioProjectId; parentId = row.parentId;
  } else if (type === "task") studioProjectId = (await one(studioTasks.id, studioTasks.studioProjectId, id, "وظیفه")).studioProjectId;
  else if (type === "notification") studioProjectId = (await one(studioNotifications.id, studioNotifications.studioProjectId, id, "اعلان")).studioProjectId;
  else if (type === "skill") {
    const [row] = await db.select({ parentId: personnelSkills.personnelId }).from(personnelSkills).where(eq(personnelSkills.id, id)).limit(1);
    if (!row) throw notFound("مهارت");
    parentId = row.parentId;
  }
  return { ...(await projectOwner(studioProjectId)), parentId };
}

function notFound(label: string) { return new ApiError(404, `${label} یافت نشد.`, "STUDIO_RESOURCE_NOT_FOUND"); }

async function one(idColumn: any, projectColumn: any, id: string, label: string) {
  const [row] = await db.select({ studioProjectId: projectColumn }).from(idColumn.table).where(eq(idColumn, id)).limit(1);
  if (!row) throw notFound(label);
  return row as { studioProjectId: string | null };
}

async function oneWithParent(idColumn: any, projectColumn: any, parentColumn: any, id: string, label: string) {
  const [row] = await db.select({ studioProjectId: projectColumn, parentId: parentColumn }).from(idColumn.table).where(eq(idColumn, id)).limit(1);
  if (!row) throw notFound(label);
  return row as { studioProjectId: string | null; parentId: string | null };
}

export async function requireStudioProjectAccess(studioProjectId: string, permission = "studio.view") {
  const owner = await resolveStudioProjectOwner(studioProjectId);
  const actor = owner.coreProjectId
    ? await requirePermission(permission, owner.coreProjectId)
    : owner.studioProjectId ? await requirePermission("admin.settings") : await requirePermission(permission);
  return { actor, owner };
}

export async function requireStudioResourceAccess(
  type: StudioScopedResource,
  id: string,
  permission: string,
  expectedStudioProjectId?: string,
  expectedParentId?: string,
) {
  const owner = await resolveStudioResourceOwner(type, id);
  if (expectedStudioProjectId && owner.studioProjectId !== expectedStudioProjectId) throw notFound("منبع در پروژه درخواستی");
  if (expectedParentId && owner.parentId !== expectedParentId) throw notFound("منبع وابسته");
  const actor = owner.coreProjectId
    ? await requirePermission(permission, owner.coreProjectId)
    : owner.studioProjectId ? await requirePermission("admin.settings") : await requirePermission(permission);
  return { actor, owner };
}

export async function requireStudioGlobalAccess(permission = "studio.view") {
  return requirePermission(permission);
}

export async function requireStudioCustomerAccess(studioCustomerId: string, permission = "studio.view") {
  assertUuid(studioCustomerId);
  const actor = await getEmployeeContext();
  if (!actor) throw new ApiError(401, "ابتدا وارد حساب کاربری شوید.");
  const [exists] = await db.select({ id: studioCustomers.id }).from(studioCustomers).where(eq(studioCustomers.id, studioCustomerId)).limit(1);
  if (!exists) throw notFound("مشتری آتلیه");
  if (actor.permissions.has("*")) return actor;
  const owners = await db.select({ coreProjectId: studioProjects.projectId }).from(studioProjects).where(eq(studioProjects.studioCustomerId, studioCustomerId));
  if (!owners.length && actor.permissions.has(permission)) return actor;
  for (const owner of owners) if (owner.coreProjectId && await canAccessPermission(actor, permission, owner.coreProjectId)) return actor;
  throw new ApiError(403, "دسترسی به مشتری خارج از محدوده پروژه مجاز نیست.", "PROJECT_SCOPE_FORBIDDEN");
}

export async function getStudioRequestScope(context?: EmployeeContext) {
  const actor = context || await getEmployeeContext();
  if (!actor) throw new ApiError(401, "ابتدا وارد حساب کاربری شوید.");
  const coreProjectIds = await getScopedProjectIds();
  return { actor, coreProjectIds };
}
