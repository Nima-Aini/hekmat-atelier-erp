import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { equipmentReservations, studioCalendarEvents, studioEquipment, studioPersonnel } from "@/db/schema";
import { ApiError, apiError, assertUuid } from "@/lib/apiError";
import { logProjectTimeline } from "@/services/studio/projectService";
import { requireStudioProjectAccess } from "@/services/studio/access";
import { assertEquipmentScheduleAvailable, assertPersonnelScheduleAvailable, lockScheduleResources } from "@/services/studio/scheduling";
import { logAuditEvent } from "@/services/audit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { actor: context } = await requireStudioProjectAccess(id, "studio.production.manage");
    const body = await req.json();
    if (!body.title?.trim()) throw new ApiError(400, "عنوان برنامه اجرا الزامی است.");
    const startTime = new Date(body.startTime); const endTime = new Date(body.endTime);
    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime()) || startTime >= endTime) throw new ApiError(400, "بازه زمانی برنامه اجرا نامعتبر است.");
    const personnelIds = Array.isArray(body.assignedPersonnelIds) ? [...new Set<string>(body.assignedPersonnelIds)] : [];
    const equipmentIds = Array.isArray(body.equipmentIds) ? [...new Set<string>(body.equipmentIds)] : [];
    [...personnelIds, ...equipmentIds].forEach(assertUuid); if (body.eventId) assertUuid(body.eventId);
    const event = await db.transaction(async (tx) => {
      await lockScheduleResources(tx, equipmentIds, personnelIds);
      if (personnelIds.length) { const found = await tx.select({ id: studioPersonnel.id }).from(studioPersonnel).where(inArray(studioPersonnel.id, personnelIds)); if (found.length !== personnelIds.length) throw new ApiError(404, "یک یا چند نیروی انتخاب‌شده یافت نشد."); }
      for (const personnelId of personnelIds) await assertPersonnelScheduleAvailable(tx, personnelId, startTime, endTime, body.eventId);
      for (const equipmentId of equipmentIds) {
        const [equipment] = await tx.select().from(studioEquipment).where(eq(studioEquipment.id, equipmentId)).limit(1);
        if (!equipment || equipment.currentHealthStatus === "retired") throw new ApiError(404, "تجهیز فعال انتخاب‌شده یافت نشد.");
        const eventReservation = body.eventId
          ? (await tx.select({ id: equipmentReservations.id }).from(equipmentReservations).where(and(eq(equipmentReservations.equipmentId, equipmentId), eq(equipmentReservations.notes, `[EventID:${body.eventId}]`))).limit(1))[0]
          : undefined;
        await assertEquipmentScheduleAvailable(tx, equipmentId, startTime, endTime, eventReservation?.id);
      }
      let saved;
      if (body.eventId) {
        const [existing] = await tx.select().from(studioCalendarEvents).where(and(eq(studioCalendarEvents.id, body.eventId), eq(studioCalendarEvents.studioProjectId, id))).for("update").limit(1);
        if (!existing) throw new ApiError(404, "برنامه اجرا یافت نشد.");
        [saved] = await tx.update(studioCalendarEvents).set({ title: body.title.trim(), startTime, endTime, location: body.location?.trim() || null, assignedPersonnelIds: personnelIds, notes: body.notes?.trim() || null, status: "confirmed", updatedAt: new Date() }).where(eq(studioCalendarEvents.id, body.eventId)).returning();
        await tx.update(equipmentReservations).set({ status: "cancelled", updatedAt: new Date() }).where(and(eq(equipmentReservations.studioProjectId, id), eq(equipmentReservations.notes, `[EventID:${body.eventId}]`)));
      } else [saved] = await tx.insert(studioCalendarEvents).values({ studioProjectId: id, title: body.title.trim(), eventType: "shooting", startTime, endTime, location: body.location?.trim() || null, assignedPersonnelIds: personnelIds, notes: body.notes?.trim() || null, status: "confirmed" }).returning();
      for (const equipmentId of equipmentIds) await tx.insert(equipmentReservations).values({ equipmentId, studioProjectId: id, reservedFrom: startTime, reservedTo: endTime, status: "reserved", notes: `[EventID:${saved.id}]` });
      await logProjectTimeline(id, { actionType: body.eventId ? "EXECUTION_UPDATED" : "EXECUTION_CREATED", title: body.eventId ? "به‌روزرسانی برنامه اجرا" : "ثبت برنامه اجرا", description: saved.title, authorName: context.employeeName, actorEmployeeId: context.employeeId, metadata: { eventId: saved.id, equipmentIds, personnelIds } }, tx);
      await logAuditEvent(body.eventId ? "STUDIO_EXECUTION_UPDATED" : "STUDIO_EXECUTION_CREATED", "studio_calendar_event", saved.id, { studioProjectId: id, equipmentIds, personnelIds, startTime: startTime.toISOString(), endTime: endTime.toISOString() }, { userId: context.employeeId, employeeId: context.employeeId, userName: context.employeeName }, tx);
      return saved;
    });
    return NextResponse.json({ success: true, event }, { status: body.eventId ? 200 : 201 });
  } catch (error) { return apiError(error, "ذخیره برنامه اجرای پروژه"); }
}
