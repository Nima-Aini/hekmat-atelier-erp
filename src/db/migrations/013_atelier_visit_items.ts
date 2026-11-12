import { sql } from "drizzle-orm";
import type { Transaction } from "@/services/product";

export const id = "013_atelier_visit_items";

export async function up(tx: Transaction) {
  await tx.execute(sql`ALTER TABLE studio_daily_visit_titles
    ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'simple',
    ADD COLUMN IF NOT EXISTS default_price NUMERIC(15,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS secondary_options JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await tx.execute(sql`ALTER TABLE studio_daily_visits ADD COLUMN IF NOT EXISTS item_snapshot JSONB`);
  // Historical titles and transaction prices are deliberately not backfilled or rewritten.
}
