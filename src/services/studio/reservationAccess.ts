import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { employees, studioPersonnel, studioReservations } from "@/db/schema";
import { getEmployeeContext, type EmployeeContext } from "@/services/access";
import { ApiError } from "@/lib/apiError";
import { assertUuid } from "@/lib/apiError";

export function isReservationAdmin(actor: EmployeeContext) { return actor.permissions.has("*"); }
export async function reservationOwnership(actor: EmployeeContext, input: Record<string, unknown>, existingId?: string) {
  const legacy = ["ownerEmployeeId", "assignedPersonnelId", "viewerEmployeeIds", "sharedPersonnelIds"];
  if (legacy.some(key => key in input)) throw new ApiError(400, "از فهرست پرسنل مجاز به مدیریت رزرو استفاده کنید.", "LEGACY_SHARING_DISABLED");
  if (!("managerPersonnelIds" in input)) return existingId ? {} : { ownerEmployeeId: actor.employeeId };
  if (!isReservationAdmin(actor)) throw new ApiError(403, "تغییر پرسنل مجاز فقط توسط مدیر انجام می‌شود.");
  const ids = input.managerPersonnelIds;
  if (!Array.isArray(ids) || ids.length > 1000) throw new ApiError(400, "فهرست پرسنل نامعتبر است.");
  for (const id of new Set(ids)) { assertUuid(id); if (!(await db.select({ id: studioPersonnel.id }).from(studioPersonnel).where(eq(studioPersonnel.id, id)).limit(1)).length) throw new ApiError(400, "پرسنل یافت نشد."); }
  return existingId ? {} : { ownerEmployeeId: actor.employeeId };
}
export async function assertReservationManage(actor: EmployeeContext, id: string) {
  if (isReservationAdmin(actor)) return;
  const result = await db.execute(sql`SELECT 1 FROM reservation_managers m JOIN studio_personnel p ON p.id=m.personnel_id WHERE m.reservation_id=${id}::uuid AND p.employee_id=${actor.employeeId}::uuid AND p.status='active'`);
  if (!(result as unknown as { rows: unknown[] }).rows?.length) throw new ApiError(403, "مدیریت این رزرو به شما واگذار نشده است.");
}
export async function saveReservationManagers(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], actor: EmployeeContext, id: string, input: Record<string, unknown>) {
  if (!("managerPersonnelIds" in input)) return;
  if (!isReservationAdmin(actor)) throw new ApiError(403, "فقط مدیر می‌تواند دسترسی را تغییر دهد.");
  await tx.execute(sql`DELETE FROM reservation_managers WHERE reservation_id=${id}::uuid`);
  for (const personnelId of new Set(input.managerPersonnelIds as string[])) await tx.execute(sql`INSERT INTO reservation_managers(reservation_id,personnel_id) VALUES(${id}::uuid,${personnelId}::uuid) ON CONFLICT DO NOTHING`);
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
  return or(sql`exists (select 1 from reservation_managers m join studio_personnel p on p.id=m.personnel_id where m.reservation_id=${studioReservations.id} and p.employee_id=${actor.employeeId}::uuid and p.status='active')`, eq(studioReservations.ownerEmployeeId, actor.employeeId),
    sql`${studioReservations.viewerEmployeeIds} @> ${JSON.stringify([actor.employeeId])}::jsonb`,
    sql`exists (select 1 from ${studioPersonnel} where ${studioPersonnel.employeeId} = ${actor.employeeId} and (${studioPersonnel.id} = ${studioReservations.assignedPersonnelId} or ${studioReservations.sharedPersonnelIds} @> jsonb_build_array(${studioPersonnel.id}::text)))`)!;
}

export async function assertReservationAccess(actor: EmployeeContext, id: string) {
  const [row] = await db.select({ id: studioReservations.id }).from(studioReservations).where(and(eq(studioReservations.id, id), await reservationScope(actor))).limit(1);
  if (!row) throw new ApiError(404, "رزرو یافت نشد.");
}
