import { NextResponse } from "next/server";
import { apiError, ApiError } from "@/lib/apiError";
import { requirePermission } from "@/services/access";
import { uploadSystemBackup } from "@/services/backup";
export const runtime = "nodejs";
export async function POST(request: Request) {
 try { const actor = await requirePermission("backup.restore"); if (!actor.permissions.has("*")) throw new ApiError(403, "بازیابی فقط توسط مدیر انجام می‌شود."); return NextResponse.json({ success: true, backup: await uploadSystemBackup(request, { employeeId: actor.employeeId, userId: actor.employeeId, userName: actor.employeeName }) }, { status: 201 }); } catch (error) { return apiError(error, "آپلود نسخه پشتیبان"); }
}
