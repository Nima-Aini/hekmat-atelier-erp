import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { employees, studioPersonnel, studioReservations } from "@/db/schema";
import { getEmployeeContext, type EmployeeContext } from "@/services/access";
import { ApiError } from "@/lib/apiError";
import { assertUuid } from "@/lib/apiError";

export async function reservationOwnership(actor: EmployeeContext, input: Record<string, unknown>, existingId?: string) {
  const fields = ["ownerEmployeeId", "assignedPersonnelId", "viewerEmployeeIds", "sharedPersonnelIds"];
  if (existingId && !fields.some(key => key in input)) return {};
  let existing: typeof studioReservations.$inferSelect | undefined;
  if (existingId) {
    const [row] = await db.select().from(studioReservations).where(eq(studioReservations.id, existingId)).limit(1);
    if (!row || (!actor.permissions.has("*") && !actor.permissions.has("studio.reservations.view_all") && row.ownerEmployeeId !== actor.employeeId)) throw new ApiError(403, "فقط مسئول رزرو می‌تواند اشتراک‌گذاری را تغییر دهد.");
    existing = row;
  }
  const has = (key: string) => Object.prototype.hasOwnProperty.call(input, key);
  const ownerEmployeeId = has("ownerEmployeeId")
    ? (typeof input.ownerEmployeeId === "string" && input.ownerEmployeeId ? input.ownerEmployeeId : actor.employeeId)
    : (existing?.ownerEmployeeId || actor.employeeId);
  if (ownerEmployeeId !== actor.employeeId && !actor.permissions.has("*") && !actor.permissions.has("studio.reservations.view_all")) throw new ApiError(403, "تغییر مسئول رزرو مجاز نیست.");
  const assignedPersonnelId = has("assignedPersonnelId")
    ? (typeof input.assignedPersonnelId === "string" && input.assignedPersonnelId ? input.assignedPersonnelId : null)
    : (existing?.assignedPersonnelId || null);
  const ids = (value: unknown) => { if (value === undefined) return []; if (!Array.isArray(value) || value.length > 100) throw new ApiError(400, "فهرست اشتراک‌گذاری نامعتبر است."); return [...new Set(value.map(v => { assertUuid(v); return v as string; }))]; };
  const viewerEmployeeIds = has("viewerEmployeeIds") ? ids(input.viewerEmployeeIds) : (existing?.viewerEmployeeIds || []);
  const sharedPersonnelIds = has("sharedPersonnelIds") ? ids(input.sharedPersonnelIds) : (existing?.sharedPersonnelIds || []);
  for (const id of [ownerEmployeeId, ...viewerEmployeeIds]) { assertUuid(id); if (!(await db.select({ id: employees.id }).from(employees).where(eq(employees.id, id)).limit(1)).length) throw new ApiError(400, "کارمند یافت نشد."); }
  for (const id of [...sharedPersonnelIds, ...(assignedPersonnelId ? [assignedPersonnelId] : [])]) { assertUuid(id); if (!(await db.select({ id: studioPersonnel.id }).from(studioPersonnel).where(eq(studioPersonnel.id, id)).limit(1)).length) throw new ApiError(400, "پرسنل یافت نشد."); }
  return { ownerEmployeeId, assignedPersonnelId, viewerEmployeeIds, sharedPersonnelIds };
}

export function reservationVisible(actor: EmployeeContext, row: { ownerEmployeeId: string | null; assignedPersonnelId: string | null; viewerEmployeeIds: unknown; sharedPersonnelIds: unknown }, personnelIds: string[] = []) {
  return actor.permissions.has("*") || actor.permissions.has("studio.reservations.view_all") || row.ownerEmployeeId === actor.employeeId ||
    (Array.isArray(row.viewerEmployeeIds) && row.viewerEmployeeIds.includes(actor.employeeId)) ||
    Boolean(row.assignedPersonnelId && personnelIds.includes(row.assignedPersonnelId)) ||
    (Array.isArray(row.sharedPersonnelIds) && row.sharedPersonnelIds.some(id => personnelIds.includes(id)));
}

export async function reservationScope(context?: EmployeeContext) {
  const actor = context || await getEmployeeContext();
  if (!actor) throw new ApiError(401, "ابتدا وارد حساب کاربری شوید.");
  if (actor.permissions.has("*") || actor.permissions.has("studio.reservations.view_all")) return sql`true`;
  return or(eq(studioReservations.ownerEmployeeId, actor.employeeId),
    sql`${studioReservations.viewerEmployeeIds} @> ${JSON.stringify([actor.employeeId])}::jsonb`,
    sql`exists (select 1 from ${studioPersonnel} where ${studioPersonnel.employeeId} = ${actor.employeeId} and (${studioPersonnel.id} = ${studioReservations.assignedPersonnelId} or ${studioReservations.sharedPersonnelIds} @> jsonb_build_array(${studioPersonnel.id}::text)))`)!;
}

export async function assertReservationAccess(actor: EmployeeContext, id: string) {
  const [row] = await db.select({ id: studioReservations.id }).from(studioReservations).where(and(eq(studioReservations.id, id), await reservationScope(actor))).limit(1);
  if (!row) throw new ApiError(404, "رزرو یافت نشد.");
}
