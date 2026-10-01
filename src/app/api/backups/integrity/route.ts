import { NextResponse } from "next/server";
import { apiError } from "@/lib/apiError";
import { pool } from "@/db";
import { requirePermission } from "@/services/access";
import { verifyDatabaseIntegrity } from "@/services/databaseIntegrity";

export async function GET() {
  try { await requirePermission("backup.verify"); return NextResponse.json({ success: true, report: await verifyDatabaseIntegrity(pool) }); }
  catch (error) { return apiError(error, "بررسی یکپارچگی پایگاه داده"); }
}
