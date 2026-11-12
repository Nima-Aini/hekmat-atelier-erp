import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { pool } from "@/db";
import { getEmployeeContext } from "@/services/access";
import { apiError, ApiError } from "@/lib/apiError";
import { DEFAULT_APPEARANCE, validAppearance } from "@/lib/appearance";
async function actor() { const value = await getEmployeeContext(); if (!value) throw new ApiError(401, "ابتدا وارد شوید."); return value; }
export async function GET() {
  try { const user = await actor(); const result = await pool.query("SELECT theme, accent FROM user_appearance WHERE employee_id=$1", [user.employeeId]); const appearance = result.rows[0] || DEFAULT_APPEARANCE; (await cookies()).set("atelier_appearance", JSON.stringify(appearance), { sameSite: "lax", path: "/", maxAge: 31536000, secure: process.env.NODE_ENV === "production" }); return NextResponse.json({ success: true, appearance }, { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return apiError(error); }
}
export async function PUT(request: Request) {
  try {
    const user = await actor(); const value: unknown = await request.json();
    if (!validAppearance(value)) throw new ApiError(400, "رنگ یا حالت نمایش نامعتبر است.");
    await pool.query("INSERT INTO user_appearance(employee_id,theme,accent) VALUES($1,$2,$3) ON CONFLICT(employee_id) DO UPDATE SET theme=$2,accent=$3", [user.employeeId, value.theme, value.accent]);
    (await cookies()).set("atelier_appearance", JSON.stringify(value), { sameSite: "lax", path: "/", maxAge: 31536000, secure: process.env.NODE_ENV === "production" });
    return NextResponse.json({ success: true });
  } catch (error) { return apiError(error); }
}
