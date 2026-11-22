import { NextResponse } from "next/server";
import { apiError, ApiError } from "@/lib/apiError";
import { requireBackupAdministrator } from "@/services/access";
import { activateRestoredDatabase, activationAvailable, prepareRestoreTarget } from "@/services/backupActivation";
import { restoreBackupToIsolatedDatabase } from "@/services/backup";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const actor = await requireBackupAdministrator(); const { id } = await params; const body = await request.json().catch(() => ({})); if (body.confirmation !== "RESTORE") throw new ApiError(400, "برای تأیید بازیابی باید عبارت RESTORE وارد شود.", "RESTORE_CONFIRMATION_REQUIRED"); if (body.activate === true && !activationAvailable()) throw new ApiError(422, "فعال‌سازی در سرور پیکربندی نشده است."); if (body.activate === true) await prepareRestoreTarget(); const result = await restoreBackupToIsolatedDatabase(id, body.confirmation, { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName }); if (body.activate === true) { const activation = await activateRestoredDatabase(id, body.confirmation, { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName }); return NextResponse.json({ success: true, result: { ...result, ...activation, switched: true } }); } return NextResponse.json({ success: true, result }); }
  catch (error) { return apiError(error, "بازیابی نسخه پشتیبان"); }
}
