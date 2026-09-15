import { NextRequest, NextResponse } from "next/server";
import { canAccessPermission, requirePermission } from "@/services/access";
import { apiError } from "@/lib/apiError";
import {
  getStudioPersonnelById,
  updateStudioPersonnel,
  deleteStudioPersonnel,
} from "@/services/studio/personnelService";
import { resolveStudioResourceOwner } from "@/services/studio/access";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requirePermission("studio.view");
    const { id } = await params;

    const personnel: any = await getStudioPersonnelById(id);
    const salaryRecords = [];
    for (const record of personnel.salaryRecords || []) {
      const owner = await resolveStudioResourceOwner("salary", record.id);
      if (await canAccessPermission(actor, "studio.personnel.wage.view", owner.coreProjectId)) salaryRecords.push(record);
    }
    const reservations = [];
    for (const reservation of personnel.reservations || []) {
      const owner = await resolveStudioResourceOwner("reservation", reservation.id);
      if (await canAccessPermission(actor, "studio.view", owner.coreProjectId)) reservations.push(reservation);
    }
    const visibleIds = new Set([...salaryRecords.map((row: any) => `salary-${row.id}`), ...reservations.map((row: any) => `res-${row.id}`)]);
    personnel.salaryRecords = salaryRecords;
    personnel.reservations = reservations;
    personnel.activityLogs = (personnel.activityLogs || []).filter((row: any) => !["financial", "equipment"].includes(row.category) || visibleIds.has(row.id));
    return NextResponse.json({ success: true, personnel });
  } catch (error) {
    return apiError(error, "دریافت مشخصات پرسنل");
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("studio.personnel.manage");
    const { id } = await params;
    const body = await req.json();

    const updated = await updateStudioPersonnel(id, body);
    return NextResponse.json({ success: true, personnel: updated });
  } catch (error) {
    return apiError(error, "ویرایش پرسنل");
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("studio.personnel.manage");
    const { id } = await params;

    const result = await deleteStudioPersonnel(id);
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error, "حذف پرسنل");
  }
}
