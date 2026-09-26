import { and, eq, gt, inArray, lt, ne, sql } from "drizzle-orm";
import { equipmentReservations, studioCalendarEvents } from "@/db/schema";
import { ApiError, assertUuid } from "@/lib/apiError";
import type { Transaction } from "@/services/product";

const ACTIVE_RESERVATION_STATUSES = ["reserved", "checked_out"];
const ACTIVE_EVENT_STATUSES = ["tentative", "scheduled", "confirmed", "postponed"];

export async function lockScheduleResources(tx: Transaction, equipmentIds: string[] = [], personnelIds: string[] = []) {
  const keys = [
    ...equipmentIds.map((id) => `equipment:${id}`),
    ...personnelIds.map((id) => `personnel:${id}`),
  ].sort();
  for (const key of keys) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  }
}

export async function assertEquipmentScheduleAvailable(
  tx: Transaction,
  equipmentId: string,
  start: Date,
  end: Date,
  excludeReservationId?: string,
) {
  assertUuid(equipmentId);
  const filters = [
    eq(equipmentReservations.equipmentId, equipmentId),
    inArray(equipmentReservations.status, ACTIVE_RESERVATION_STATUSES),
    lt(equipmentReservations.reservedFrom, end),
    gt(equipmentReservations.reservedTo, start),
  ];
  if (excludeReservationId) filters.push(ne(equipmentReservations.id, excludeReservationId));
  const [conflict] = await tx.select({ id: equipmentReservations.id }).from(equipmentReservations).where(and(...filters)).limit(1);
  if (conflict) { console.warn("scheduling.equipment_conflict", { equipmentId, conflictId: conflict.id }); throw new ApiError(409, "تداخل زمانی! تجهیز در بازه انتخاب‌شده قبلاً رزرو شده است.", "EQUIPMENT_ALREADY_RESERVED"); }
}

export async function assertPersonnelScheduleAvailable(
  tx: Transaction,
  personnelId: string,
  start: Date,
  end: Date,
  excludeEventId?: string,
  excludeReservationId?: string,
) {
  assertUuid(personnelId);
  const eventFilters = [
    inArray(studioCalendarEvents.status, ACTIVE_EVENT_STATUSES),
    lt(studioCalendarEvents.startTime, end),
    gt(studioCalendarEvents.endTime, start),
    sql`${studioCalendarEvents.assignedPersonnelIds} @> ${JSON.stringify([personnelId])}::jsonb`,
  ];
  if (excludeEventId) eventFilters.push(ne(studioCalendarEvents.id, excludeEventId));
  const [eventConflict] = await tx.select({ id: studioCalendarEvents.id }).from(studioCalendarEvents).where(and(...eventFilters)).limit(1);
  const reservationFilters = [
    eq(equipmentReservations.assignedPersonnelId, personnelId),
    inArray(equipmentReservations.status, ACTIVE_RESERVATION_STATUSES),
    lt(equipmentReservations.reservedFrom, end),
    gt(equipmentReservations.reservedTo, start),
  ];
  if (excludeReservationId) reservationFilters.push(ne(equipmentReservations.id, excludeReservationId));
  const [reservationConflict] = await tx
    .select({ id: equipmentReservations.id })
    .from(equipmentReservations)
    .where(and(...reservationFilters))
    .limit(1);
  if (eventConflict || reservationConflict) { console.warn("scheduling.personnel_conflict", { personnelId, eventId: eventConflict?.id || null, reservationId: reservationConflict?.id || null }); throw new ApiError(409, "پرسنل در بازه انتخاب‌شده برنامه فعال دیگری دارد.", "PERSONNEL_SCHEDULE_CONFLICT"); }
}
