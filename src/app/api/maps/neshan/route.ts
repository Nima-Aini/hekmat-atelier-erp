import { getEmployeeContext } from "@/services/access";
import { ApiError } from "@/lib/apiError";
import { apiError } from "@/lib/apiError";
import { NextResponse } from "next/server";
function getNeshanKey(): string {
  const key = process.env.NESHAN_API_KEY?.trim();
  if (!key) throw new ApiError(503, "سرویس نقشه پیکربندی نشده است.");
  return key;
}

export async function GET(req: Request) {
  try {
    if (!await getEmployeeContext()) throw new ApiError(401, "ابتدا وارد حساب کاربری شوید.");
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action") || "search";
    const apiKey = getNeshanKey();

    if (action === "search") {
      const term = searchParams.get("term") || searchParams.get("q") || "";
      const latNumber = Number(searchParams.get("lat") || "35.6892");
      const lngNumber = Number(searchParams.get("lng") || "51.3890");
      if (!Number.isFinite(latNumber) || !Number.isFinite(lngNumber) || Math.abs(latNumber) > 90 || Math.abs(lngNumber) > 180) {
        throw new ApiError(400, "مختصات جستجو نامعتبر است.");
      }

      if (!term.trim()) {
        return NextResponse.json({ success: true, count: 0, items: [] });
      }

      const neshanUrl = `https://api.neshan.org/v1/search?term=${encodeURIComponent(term)}&lat=${latNumber}&lng=${lngNumber}`;
      const res = await fetch(neshanUrl, {
        headers: {
          "Api-Key": apiKey,
        },
      });

      if (!res.ok) {
        console.warn("Neshan Search API request failed with status:", res.status);
        return NextResponse.json({
          success: false,
          error: "جستجوی نقشه انجام نشد؛ تنظیمات API نشان را بررسی کنید.",
          items: [],
        }, { status: 502 });
      }

      const data = await res.json();
      return NextResponse.json({
        success: true,
        count: data.count || data.items?.length || 0,
        items: data.items || [],
      });
    }

    if (action === "reverse") {
      const lat = searchParams.get("lat");
      const lng = searchParams.get("lng");

      const latNumber = Number(lat);
      const lngNumber = Number(lng);
      if (!lat || !lng || !Number.isFinite(latNumber) || !Number.isFinite(lngNumber) || Math.abs(latNumber) > 90 || Math.abs(lngNumber) > 180) {
        return NextResponse.json({ success: false, error: "lat و lng الزامی هستند." }, { status: 400 });
      }

      const neshanUrl = `https://api.neshan.org/v5/reverse?lat=${latNumber}&lng=${lngNumber}`;
      const res = await fetch(neshanUrl, {
        headers: {
          "Api-Key": apiKey,
        },
      });

      if (!res.ok) {
        console.warn("Neshan Reverse API request failed with status:", res.status);
        return NextResponse.json({
          success: false,
          error: "دریافت نشانی از سرویس نقشه انجام نشد.",
        }, { status: 502 });
      }

      const data = await res.json();
      return NextResponse.json({
        success: true,
        data: {
          formatted_address: data.formatted_address || data.address || "",
          route_name: data.route_name || "",
          neighbourhood: data.neighbourhood || "",
          city: data.city || data.municipality_zone || "",
          state: data.state || "",
          in_traffic_zone: data.in_traffic_zone || false,
          in_odd_even_zone: data.in_odd_even_zone || false,
          raw: data,
        },
      });
    }

    return NextResponse.json({ success: false, error: "عملیات نامعتبر است." }, { status: 400 });
  } catch (error: unknown) {
    if (!(error instanceof ApiError)) console.error("Neshan API route failed unexpectedly.", error);
    return apiError(error);
  }
}
