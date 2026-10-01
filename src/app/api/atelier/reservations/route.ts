import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { db } from "@/db";
import { employees, studioPersonnel } from "@/db/schema";
import { requireAnyPermission, requirePermission } from "@/services/access";
import {
  listReservations,
  saveReservation,
} from "@/services/studio/finalWorkflow";
export async function GET(req: NextRequest) {
  try {
    const actor = await requireAnyPermission(["studio.reservations.view", "studio.reservations.manage", "studio.view"]);
    const params = new URL(req.url).searchParams;
    const rows = await listReservations(false, actor);
    const mine = params.get("scope") === "mine", shared = params.get("scope") === "shared", personnel = params.get("personnel");
    return NextResponse.json({
      success: true,
      reservations: rows.filter(row => (!mine || row.ownerEmployeeId === actor.employeeId) && (!shared || row.ownerEmployeeId !== actor.employeeId) && (!personnel || row.assignedPersonnelId === personnel || (Array.isArray(row.sharedPersonnelIds) && row.sharedPersonnelIds.includes(personnel)))),
      viewerOptions: await db.select({ id: employees.id, name: employees.name }).from(employees),
      personnelOptions: await db.select({ id: studioPersonnel.id, fullName: studioPersonnel.fullName, employeeId: studioPersonnel.employeeId }).from(studioPersonnel),
    });
  } catch (error) {
    return apiError(error, "دریافت رزروها");
  }
}
export async function POST(req: NextRequest) {
  try {
    const actor = await requirePermission("studio.reservations.create");
    return NextResponse.json(
      {
        success: true,
        reservation: await saveReservation(actor, await req.json()),
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error, "ثبت رزرو");
  }
}
