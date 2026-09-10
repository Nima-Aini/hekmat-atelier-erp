import "dotenv/config";
import { pool } from "../src/db";
import { verifyDatabaseIntegrity } from "../src/services/databaseIntegrity";

async function main() {
  let code = 0;
  try { const report = await verifyDatabaseIntegrity(pool); console.log("database.integrity", report); code = report.valid ? 0 : 2; }
  catch (error) { console.error("database.integrity.failed", { message: error instanceof Error ? error.message : "unknown error" }); code = 1; }
  finally { await pool.end(); }
  return code;
}
void main().then((code) => process.exit(code));
