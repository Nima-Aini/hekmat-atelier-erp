import { NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requirePermission } from "@/services/access";
import { restoreBackupToIsolatedDatabase } from "@/services/backup";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const actor = await requirePermission("backup.restore"); const { id } = await params; const body = await request.json().catch(() => ({})); const result = await restoreBackupToIsolatedDatabase(id, body.confirmation, { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName }); return NextResponse.json({ success: true, result }); }
  catch (error) { return apiError(error, "بازیابی نسخه پشتیبان"); }
}
