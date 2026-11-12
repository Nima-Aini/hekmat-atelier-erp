import { NextRequest, NextResponse } from "next/server";
import { getMaintenanceState } from "@/services/maintenance";
export async function proxy(req: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return NextResponse.next();
  try {
    const maintenance = await getMaintenanceState();
    if (maintenance) return NextResponse.json({ success: false, error: "سامانه برای عملیات بازیابی موقتاً فقط‌خواندنی است.", code: "MAINTENANCE_MODE" }, { status: 503, headers: { "Retry-After": "60" } });
  } catch (error) {
    console.error("maintenance.state_unavailable", { error });
    return NextResponse.json({ success: false, error: "وضعیت آمادگی سامانه قابل تأیید نیست.", code: "WRITE_GATE_UNAVAILABLE" }, { status: 503, headers: { "Retry-After": "30" } });
  }
  const origin = req.headers.get("origin");
  let crossOrigin = req.headers.get("sec-fetch-site") === "cross-site";
  if (origin) {
    try { crossOrigin ||= new URL(origin).host !== req.headers.get("host"); }
    catch { crossOrigin = true; }
  }
  if (crossOrigin) return NextResponse.json({ success: false, error: "مبدأ درخواست مجاز نیست." }, { status: 403 });
  return NextResponse.next();
}
export const config = { matcher: "/api/:path*" };
