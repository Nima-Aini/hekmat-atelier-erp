import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { equipmentReservations, studioCalendarEvents } from "@/db/schema";
import { ApiError, apiError, assertUuid } from "@/lib/apiError";
import { logProjectTimeline } from "@/services/studio/projectService";
import { requireStudioResourceAccess } from "@/services/studio/access";
import { logAuditEvent } from "@/services/audit";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; assertUuid(id);
    const { actor: context } = await requireStudioResourceAccess("calendar", id, "studio.production.manage");
    const event = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(studioCalendarEvents).where(eq(studioCalendarEvents.id, id)).for("update").limit(1);
      if (!existing) throw new ApiError(404, "رویداد تقویم یافت نشد.");
      if (existing.status === "completed") throw new ApiError(409, "رویداد تکمیل‌شده قابل حذف نیست؛ وضعیت تاریخی آن باید حفظ شود.");
      const [updated] = await tx.update(studioCalendarEvents).set({ status: "cancelled", updatedAt: new Date() }).where(eq(studioCalendarEvents.id, id)).returning();
      if (existing.studioProjectId) {
        await tx.update(equipmentReservations).set({ status: "cancelled", updatedAt: new Date() }).where(and(eq(equipmentReservations.studioProjectId, existing.studioProjectId), eq(equipmentReservations.notes, `[EventID:${id}]`)));
        await logProjectTimeline(existing.studioProjectId, { actionType: "EXECUTION_CANCELLED", title: "لغو برنامه اجرا", description: existing.title, authorName: context.employeeName, actorEmployeeId: context.employeeId, metadata: { eventId: id } }, tx);
      }
      await logAuditEvent("STUDIO_CALENDAR_CANCELLED", "studio_calendar_event", id, { studioProjectId: existing.studioProjectId, before: { status: existing.status }, after: { status: "cancelled" } }, { userId: context.employeeId, employeeId: context.employeeId, userName: context.employeeName }, tx);
      return updated;
    });
    return NextResponse.json({ success: true, event });
  } catch (error) { return apiError(error, "لغو رویداد تقویم"); }
}
