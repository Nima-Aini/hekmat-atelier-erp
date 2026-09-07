import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/services/access";
import { apiError, assertUuid } from "@/lib/apiError";
import { reserveStudioEquipment } from "@/services/studio/equipmentService";
import { db } from "@/db";
import {
  equipmentReservations,
  studioEquipment,
  studioProjects,
  studioPersonnel,
} from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("studio.view");
    const { searchParams } = new URL(req.url);

    const equipmentId = searchParams.get("equipmentId");
    const studioProjectId = searchParams.get("studioProjectId");
    const status = searchParams.get("status");

    const conditions = [];

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
    await requirePermission("studio.equipment.reserve");
    const body = await req.json();

    const reservation = await reserveStudioEquipment(body);
    return NextResponse.json({ success: true, reservation }, { status: 201 });
  } catch (error) {
    return apiError(error, "رزرو تجهیز");
  }
}
