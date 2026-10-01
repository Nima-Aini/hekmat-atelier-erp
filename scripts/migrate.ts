import "dotenv/config";
import { migrateDatabase } from "../src/db/migrate";
import { pool } from "../src/db";

async function main() {
  let code = 0;
  try { await migrateDatabase(); console.log("migration.success"); }
  catch (error) { console.error("migration.failed", { message: error instanceof Error ? error.message : "unknown error" }); code = 1; }
  finally { await pool.end(); }
  return code;
}
void main().then((code) => process.exit(code));
