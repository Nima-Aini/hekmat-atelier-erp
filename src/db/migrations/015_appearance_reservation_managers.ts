import { sql } from "drizzle-orm";
import type { db } from "@/db";
export const id = "015_appearance_reservation_managers";
export const statements = [
 "CREATE TABLE IF NOT EXISTS user_appearance (employee_id UUID PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE, theme TEXT NOT NULL CHECK(theme IN ('light','dark')), accent TEXT NOT NULL CHECK(accent ~ '^#[0-9a-fA-F]{6}$'))",
 "CREATE TABLE IF NOT EXISTS reservation_managers (reservation_id UUID NOT NULL REFERENCES studio_reservations(id) ON DELETE CASCADE, personnel_id UUID NOT NULL REFERENCES studio_personnel(id) ON DELETE CASCADE, PRIMARY KEY(reservation_id, personnel_id))",
 "CREATE INDEX IF NOT EXISTS idx_reservation_managers_personnel ON reservation_managers(personnel_id)",
];
export async function up(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) { for (const statement of statements) await tx.execute(sql.raw(statement)); }
