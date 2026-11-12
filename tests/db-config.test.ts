import { describe, expect, it } from "vitest";
import { resolveDatabaseConfig } from "../src/db/config";

describe("production database selection", () => {
  it("accepts local PostgreSQL in production", () => {
    expect(resolveDatabaseConfig({ NODE_ENV: "production", DB_DRIVER: "postgres", DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/atelier" }).driver).toBe("postgres");
  });
  it("accepts remote PostgreSQL in production", () => {
    expect(resolveDatabaseConfig({ NODE_ENV: "production", DATABASE_URL: "postgresql://u:p@db.example.test:5432/atelier" }).driver).toBe("postgres");
  });
  it("fails production without DATABASE_URL", () => {
    expect(() => resolveDatabaseConfig({ NODE_ENV: "production", DB_DRIVER: "postgres" })).toThrow("DATABASE_URL");
  });
  it("allows explicit PGlite in development", () => {
    expect(resolveDatabaseConfig({ NODE_ENV: "development", DB_DRIVER: "pglite" }).driver).toBe("pglite");
  });
  it("makes production PGlite impossible", () => {
    expect(() => resolveDatabaseConfig({ NODE_ENV: "production", DB_DRIVER: "pglite", DATABASE_URL: "postgresql://u:p@localhost:5432/atelier" })).toThrow("forbidden");
  });
  it("does not implicitly fall back to PGlite outside production", () => {
    expect(() => resolveDatabaseConfig({ NODE_ENV: "development" })).toThrow("DATABASE_URL");
  });
  it("refuses PostgreSQL tests without an explicit isolated test URL", () => {
    expect(() => resolveDatabaseConfig({ NODE_ENV: "test", DB_DRIVER: "postgres", DATABASE_URL: "postgresql://u:p@db.example.test/main" })).toThrow("ALLOW_TEST_DATABASE");
    expect(() => resolveDatabaseConfig({ NODE_ENV: "test", DB_DRIVER: "postgres", DATABASE_URL: "postgresql://u:p@db.example.test/main", TEST_DATABASE_URL: "postgresql://u:p@db.example.test/test", ALLOW_TEST_DATABASE: "true" })).toThrow("exactly match");
    expect(resolveDatabaseConfig({ NODE_ENV: "test", DB_DRIVER: "postgres", DATABASE_URL: "postgresql://u:p@db.example.test/run_123", TEST_DATABASE_URL: "postgresql://u:p@db.example.test/run_123", ALLOW_TEST_DATABASE: "true" }).driver).toBe("postgres");
  });
});
