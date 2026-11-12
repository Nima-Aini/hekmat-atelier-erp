import { NextResponse } from "next/server";
import { activeDatabaseDriver } from "@/db";

export async function GET() {
  return NextResponse.json({ status: "ok", timestamp: new Date().toISOString(), process: "alive", databaseDriver: activeDatabaseDriver });
}
