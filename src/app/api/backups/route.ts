import { NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requirePermission } from "@/services/access";
import { createSystemBackup, getBackupsList } from "@/services/backup";

export async function GET() {
  try { await requirePermission("backup.view"); return NextResponse.json({ success: true, backups: await getBackupsList() }); }
  catch (error) { return apiError(error, "دریافت فهرست نسخه‌های پشتیبان"); }
}

export async function POST(request: Request) {
  try {
    const actor = await requirePermission("backup.create");
    const body = await request.json().catch(() => ({}));
    if (body.notes !== undefined && typeof body.notes !== "string") return NextResponse.json({ success: false, error: "یادداشت معتبر نیست." }, { status: 400 });
    const backup = await createSystemBackup({ userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName }, body.notes);
    return NextResponse.json({ success: true, backup }, { status: 201 });
  } catch (error) { return apiError(error, "ایجاد نسخه پشتیبان"); }
}
