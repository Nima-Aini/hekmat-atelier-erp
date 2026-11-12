import { NextResponse } from "next/server";
import { pool } from "@/db";
import { requirePermission } from "@/services/access";
import { apiError, ApiError } from "@/lib/apiError";
export async function GET() {
 try {
  const actor = await requirePermission("backup.restore"); if (!actor.permissions.has("*")) throw new ApiError(403, "فقط مدیر مجاز است.");
  const result = await pool.query("SELECT id, action, entity_id AS backup_id, user_name, created_at, details->>'safetyBackupId' AS safety_backup_id FROM audit_logs WHERE action IN ('RESTORE_STARTED','RESTORE_SAFETY_BACKUP_READY','RESTORE_TARGET_VERIFIED','RESTORE_FAILED','RESTORE_ACTIVATED','RESTORE_ACTIVATION_REVERTED','RESTORE_ACTIVATION_ROLLED_BACK') ORDER BY created_at DESC LIMIT 100");
  return NextResponse.json({ success: true, history: result.rows }, { headers: { "Cache-Control": "private, no-store" } });
 } catch (error) { return apiError(error); }
}
