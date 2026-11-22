import { NextResponse } from "next/server";
import { apiError, ApiError } from "@/lib/apiError";
import { requireBackupAdministrator } from "@/services/access";
import { deleteSystemBackup, getBackupById } from "@/services/backup";

type Context = { params: Promise<{ id: string }> };
export async function GET(_: Request, { params }: Context) {
  try { await requireBackupAdministrator(); const { id } = await params; const backup = await getBackupById(id); if (!backup) throw new ApiError(404, "نسخه پشتیبان یافت نشد.", "BACKUP_NOT_FOUND"); return NextResponse.json({ success: true, backup }); }
  catch (error) { return apiError(error, "دریافت نسخه پشتیبان"); }
}
export async function DELETE(_: Request, { params }: Context) {
  try { const actor = await requireBackupAdministrator(); const { id } = await params; await deleteSystemBackup(id, { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName }); return NextResponse.json({ success: true }); }
  catch (error) { return apiError(error, "حذف نسخه پشتیبان"); }
}
