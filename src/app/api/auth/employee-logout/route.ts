import { NextResponse } from "next/server";
import { db } from "@/db";
import { employeeAccounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifySessionDetails } from "@/services/employeeAuth";

export async function POST(req: Request) {
  const cookie = req.headers.get("cookie")?.match(/(?:^|;\s*)employee_session=([^;]+)/)?.[1];
  const session = cookie ? verifySessionDetails(cookie) : null;
  if (session) await db.update(employeeAccounts).set({ sessionInvalidBefore: new Date(), updatedAt: new Date() }).where(eq(employeeAccounts.employeeId, session.employeeId));
  const r = NextResponse.json({ success: true });
  r.cookies.set("employee_session", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.SECURE_COOKIES !== "false" && process.env.NODE_ENV === "production",
    expires: new Date(0),
    path: "/",
  });
  return r;
}
