import { NextRequest, NextResponse } from "next/server";
import { getScopedProjectIds } from "@/services/access";
import { apiError, assertUuid } from "@/lib/apiError";
import { reserveStudioEquipment } from "@/services/studio/equipmentService";
import { db } from "@/db";
import {
  equipmentReservations,
  studioEquipment,
  studioProjects,
  studioPersonnel,
} from "@/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { requireStudioGlobalAccess, requireStudioProjectAccess } from "@/services/studio/access";

export async function GET(req: NextRequest) {
  try {
    await requireStudioGlobalAccess("studio.view");
    const allowedCoreProjectIds = await getScopedProjectIds();
    const { searchParams } = new URL(req.url);

    const equipmentId = searchParams.get("equipmentId");
    const studioProjectId = searchParams.get("studioProjectId");
    const status = searchParams.get("status");

    const conditions = [];
    if (allowedCoreProjectIds !== null) conditions.push(allowedCoreProjectIds.length ? inArray(studioProjects.projectId, allowedCoreProjectIds) : sql`false`);

    if (equipmentId) {
      assertUuid(equipmentId);
      conditions.push(eq(equipmentReservations.equipmentId, equipmentId));
    }

    if (studioProjectId) {
      assertUuid(studioProjectId);
      conditions.push(eq(equipmentReservations.studioProjectId, studioProjectId));
    }

    if (status && status !== "all") {
      conditions.push(eq(equipmentReservations.status, status));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const list = await db
      .select({
        id: equipmentReservations.id,
        equipmentId: equipmentReservations.equipmentId,
        equipmentCode: studioEquipment.code,
        equipmentTitle: studioEquipment.title,
        equipmentCategory: studioEquipment.category,
        studioProjectId: equipmentReservations.studioProjectId,
        projectTitle: studioProjects.title,
        projectNumber: studioProjects.projectNumber,
        assignedPersonnelId: equipmentReservations.assignedPersonnelId,
        personnelName: studioPersonnel.fullName,
        reservedFrom: equipmentReservations.reservedFrom,
        reservedTo: equipmentReservations.reservedTo,
        status: equipmentReservations.status,
        checkoutTime: equipmentReservations.checkoutTime,
        checkinTime: equipmentReservations.checkinTime,
        conditionOnCheckout: equipmentReservations.conditionOnCheckout,
        conditionOnReturn: equipmentReservations.conditionOnReturn,
        notes: equipmentReservations.notes,
        createdAt: equipmentReservations.createdAt,
      })
      .from(equipmentReservations)
      .innerJoin(studioEquipment, eq(equipmentReservations.equipmentId, studioEquipment.id))
      .leftJoin(studioProjects, eq(equipmentReservations.studioProjectId, studioProjects.id))
      .leftJoin(studioPersonnel, eq(equipmentReservations.assignedPersonnelId, studioPersonnel.id))
      .where(where)
      .orderBy(desc(equipmentReservations.reservedFrom))
      .limit(100);

    return NextResponse.json({ success: true, reservations: list });
  } catch (error) {
    return apiError(error, "دریافت فهرست رزروهای تجهیزات");
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const actor = body.studioProjectId
      ? (await requireStudioProjectAccess(body.studioProjectId, "studio.equipment.reserve")).actor
      : await requireStudioGlobalAccess("studio.equipment.reserve");

    const reservation = await reserveStudioEquipment({ ...body, actorId: actor.employeeId, authorName: actor.employeeName });
    return NextResponse.json({ success: true, reservation }, { status: 201 });
  } catch (error) {
    return apiError(error, "رزرو تجهیز");
  }
}
