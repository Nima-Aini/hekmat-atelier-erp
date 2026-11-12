import { db } from "@/db";
import { equipmentReservations, studioEquipment, studioPersonnel, studioProjects, studioContractItems } from "@/db/schema";
import { and, asc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { ApiError, assertUuid } from "@/lib/apiError";
import { toJalaliDate } from "@/lib/dateUtils";

export async function getEquipmentUsage(from: Date, to: Date, scope: string[] | null, equipmentId?: string) {
  if (!Number.isFinite(+from) || !Number.isFinite(+to) || +to <= +from || +to - +from > 370 * 86400000) throw new ApiError(400, "بازه تقویم تجهیزات معتبر نیست.");
  if (equipmentId) assertUuid(equipmentId);
  return db.select({ id: equipmentReservations.id, equipmentId: studioEquipment.id, equipmentTitle: studioEquipment.title,
    healthStatus: studioEquipment.currentHealthStatus, locationType: studioEquipment.locationType,
    reservedFrom: equipmentReservations.reservedFrom, reservedTo: equipmentReservations.reservedTo, status: equipmentReservations.status,
    projectTitle: studioProjects.title, projectId: studioProjects.projectId, personnelName: studioPersonnel.fullName,
    workTitle: studioContractItems.title, contractId: studioContractItems.contractId,
  }).from(equipmentReservations)
    .innerJoin(studioEquipment, eq(studioEquipment.id, equipmentReservations.equipmentId))
    .leftJoin(studioProjects, eq(studioProjects.id, equipmentReservations.studioProjectId))
    .leftJoin(studioPersonnel, eq(studioPersonnel.id, equipmentReservations.assignedPersonnelId))
    .leftJoin(studioContractItems, eq(studioContractItems.id, equipmentReservations.contractItemId))
    .where(and(lt(equipmentReservations.reservedFrom, to), gt(equipmentReservations.reservedTo, from),
      equipmentId ? eq(studioEquipment.id, equipmentId) : undefined,
      scope === null ? undefined : scope.length ? inArray(studioProjects.projectId, scope) : sql`false`))
    .orderBy(asc(equipmentReservations.reservedFrom));
}

export async function equipmentMaintenanceAlerts(scope: string[] | null) {
  const now = new Date();
  // Alerts consider all future bookings, not just the currently visible month.
  const bookings = await db.select({ id: equipmentReservations.id, equipmentId: equipmentReservations.equipmentId, reservedFrom: equipmentReservations.reservedFrom, status: equipmentReservations.status, projectTitle: studioProjects.title, workTitle: studioContractItems.title })
    .from(equipmentReservations).leftJoin(studioProjects, eq(studioProjects.id, equipmentReservations.studioProjectId)).leftJoin(studioContractItems, eq(studioContractItems.id, equipmentReservations.contractItemId))
    .where(and(gt(equipmentReservations.reservedTo, now), inArray(equipmentReservations.status, ["reserved", "checked_out"]), scope === null ? undefined : scope.length ? inArray(studioProjects.projectId, scope) : sql`false`)).orderBy(asc(equipmentReservations.reservedFrom));
  const unhealthy = await db.select().from(studioEquipment).where(sql`(${studioEquipment.currentHealthStatus} IN ('damaged','needs_service','retired') OR ${studioEquipment.locationType} = 'maintenance')`);
  return unhealthy.flatMap(equipment => {
    const impacted = bookings.filter(row => row.equipmentId === equipment.id && ["reserved", "checked_out"].includes(row.status));
    if (scope !== null && !impacted.length) return [];
    return [{ id: `equipment-health:${equipment.id}`, priority: impacted.length ? "critical" : "warning", category: "equipment", entityType: "equipment", entityId: equipment.id, tab: "equipment",
      title: impacted.length ? "تجهیز معیوب دارای برنامه فعال" : "تجهیز نیازمند تعمیر",
      message: `${equipment.title} آماده استفاده نیست.${impacted.length ? ` برنامه‌های تحت تأثیر: ${impacted.map(row => `${row.projectTitle || row.workTitle || "رزرو تجهیز"} (${toJalaliDate(row.reservedFrom, { showTime: true })})`).join("، ")}` : " وضعیت تعمیر را بررسی کنید."}`,
      date: impacted[0]?.reservedFrom || equipment.updatedAt,
      affectedReservations: impacted.map(row => ({ id: row.id, reservedFrom: row.reservedFrom, projectTitle: row.projectTitle })),
    }];
  });
}
