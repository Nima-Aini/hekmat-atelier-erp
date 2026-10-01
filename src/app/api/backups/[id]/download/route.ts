import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { apiError } from "@/lib/apiError";
import { requirePermission } from "@/services/access";
import { getBackupDownload } from "@/services/backup";
import { logAuditEvent } from "@/services/audit";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission("backup.download"); const { id } = await params; const { row, path } = await getBackupDownload(id);
    await logAuditEvent("BACKUP_DOWNLOADED", "database_backup", id, { checksum: row.checksum, sizeBytes: row.sizeBytesBigint || row.sizeBytes }, { userId: actor.employeeId, employeeId: actor.employeeId, userName: actor.employeeName });
    return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="hekmat-atelier-${id}.dump"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return apiError(error, "دریافت فایل پشتیبان"); }
}
