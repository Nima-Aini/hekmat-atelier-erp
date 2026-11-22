import { activationAvailable } from "@/services/backupActivation";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requireBackupAdministrator } from "@/services/access";
import { createSystemBackup, getBackupsList, isolatedRestoreConfigured } from "@/services/backup";

export async function GET() {
  try { await requireBackupAdministrator(); return NextResponse.json({ success: true, activationAvailable: activationAvailable(), isolatedRestoreAvailable: isolatedRestoreConfigured(), backups: await getBackupsList() }); }
  catch (error) { return apiError(error, "دریافت فهرست نسخه‌های پشتیبان"); }
}

export async function POST(request: Request) {
  try {
    const actor = await requireBackupAdministrator();
    const body = await request.json().catch(() => ({}));
    if (body.notes !== undefined && typeof body.notes !== "string") return NextResponse.json({ success: false, error: "یادداشت معتبر نیست." }, { status: 400 });
    const backup = await createSystemBackup({ userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName }, body.notes);
    return NextResponse.json({ success: true, backup }, { status: 201 });
  } catch (error) { return apiError(error, "ایجاد نسخه پشتیبان"); }
}
