export type DatabaseDriver = "postgres" | "pglite";

export interface DatabaseConfig {
  driver: DatabaseDriver;
  databaseUrl?: string;
  ssl?: { rejectUnauthorized: boolean };
  pgliteDataDir?: string;
}

export function resolveDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const production = env.NODE_ENV === "production";
  const requested = env.DB_DRIVER?.trim().toLowerCase();
  if (requested && requested !== "postgres" && requested !== "pglite") throw new Error("DB_DRIVER must be either 'postgres' or 'pglite'.");
  if (production && requested === "pglite") throw new Error("PGlite is forbidden in production. Configure DB_DRIVER=postgres and DATABASE_URL.");
  const driver: DatabaseDriver = production ? "postgres" : requested === "pglite" ? "pglite" : "postgres";
  if (driver === "postgres") {
    const databaseUrl = env.DATABASE_URL?.trim();
    if (!databaseUrl) throw new Error("DATABASE_URL is required when DB_DRIVER=postgres.");
    let parsed: URL;
    try { parsed = new URL(databaseUrl); } catch { throw new Error("DATABASE_URL must be a valid PostgreSQL URL."); }
    if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.hostname || !parsed.pathname.slice(1)) throw new Error("DATABASE_URL must be a valid PostgreSQL URL with host and database name.");
    if (env.NODE_ENV === "test") {
      if (env.ALLOW_TEST_DATABASE !== "true" || !env.TEST_DATABASE_URL?.trim()) throw new Error("PostgreSQL tests require explicit ALLOW_TEST_DATABASE=true and TEST_DATABASE_URL.");
      if (env.TEST_DATABASE_URL.trim() !== databaseUrl) throw new Error("DATABASE_URL must exactly match TEST_DATABASE_URL while NODE_ENV=test.");
    }
    const sslMode = env.PGSSL_MODE?.trim().toLowerCase();
    const ssl = sslMode === "require" ? { rejectUnauthorized: true } : undefined;
    return { driver, databaseUrl, ssl };
  }
  return { driver, pgliteDataDir: env.NODE_ENV === "test" ? undefined : env.PGLITE_DATA_DIR?.trim() || "./.pgdata" };
}
