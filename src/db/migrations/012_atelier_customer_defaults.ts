import { sql } from "drizzle-orm";
import type { Transaction } from "@/services/product";

export const id = "012_atelier_customer_defaults";

export async function up(tx: Transaction) {
  // Metadata-only change: existing customer rows and their coordinates remain untouched.
  await tx.execute(sql`ALTER TABLE customers
    ALTER COLUMN city DROP DEFAULT,
    ALTER COLUMN latitude DROP DEFAULT,
    ALTER COLUMN longitude DROP DEFAULT,
    ALTER COLUMN payment_terms_days DROP DEFAULT,
    ALTER COLUMN credit_limit DROP DEFAULT`);
}
