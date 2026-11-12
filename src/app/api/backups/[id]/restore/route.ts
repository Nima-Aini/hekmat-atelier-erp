import { NextResponse } from "next/server";
import { apiError, ApiError } from "@/lib/apiError";
import { requirePermission } from "@/services/access";
import { activateRestoredDatabase, activationAvailable, prepareRestoreTarget } from "@/services/backupActivation";
import { restoreBackupToIsolatedDatabase } from "@/services/backup";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const actor = await requirePermission("backup.restore"); if (!actor.permissions.has("*")) throw new ApiError(403, "بازیابی فقط توسط مدیر انجام می‌شود."); const { id } = await params; const body = await request.json().catch(() => ({})); if (body.activate === true && !activationAvailable()) throw new ApiError(422, "فعال‌سازی در سرور پیکربندی نشده است."); if (body.activate === true) await prepareRestoreTarget(); const result = await restoreBackupToIsolatedDatabase(id, body.confirmation, { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName }); if (body.activate === true) { const activation = await activateRestoredDatabase(id, body.confirmation, { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName }); return NextResponse.json({ success: true, result: { ...result, ...activation, switched: true } }); } return NextResponse.json({ success: true, result }); }
  catch (error) { return apiError(error, "بازیابی نسخه پشتیبان"); }
}
