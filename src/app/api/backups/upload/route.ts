import { NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { requireBackupAdministrator } from "@/services/access";
import { uploadSystemBackup } from "@/services/backup";
export const runtime = "nodejs";
export async function POST(request: Request) {
 try { const actor = await requireBackupAdministrator(); return NextResponse.json({ success: true, backup: await uploadSystemBackup(request, { employeeId: actor.employeeId, userId: actor.employeeId, userName: actor.employeeName }) }, { status: 201 }); } catch (error) { return apiError(error, "آپلود نسخه پشتیبان"); }
}
