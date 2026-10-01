import { NextResponse } from "next/server";
import { eq, inArray, and } from "drizzle-orm";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { apiError } from "@/lib/apiError";
import { requirePermission } from "@/services/access";
export async function GET() {
  try {
    await requirePermission("studio.personnel.finance.pay");
    const rows = await db.select({ id: accounts.id, name: accounts.name, type: accounts.type }).from(accounts).where(and(eq(accounts.status, "active"), inArray(accounts.type, ["bank", "cash", "pos", "other"])));
    return NextResponse.json({ success: true, accounts: rows });
  } catch (error) { return apiError(error); }
}
