import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { migrateDatabase } from "../src/db/migrate";
import { assertLoginAllowed, clearLoginFailures, ensureDefaultAdminAccount, loginAttemptKey, recordLoginFailure, signSession, verifySessionDetails } from "../src/services/employeeAuth";

vi.mock("@/services/access", () => ({
  getEmployeeContext: vi.fn(async () => ({ employeeId: "00000000-0000-4000-8000-000000000001" })),
}));

import { GET as neshanRoute } from "../src/app/api/maps/neshan/route";
import { missingRequiredMigrations } from "../src/app/api/readiness/route";
import { requiredMigrationIds } from "../src/db/migrations";

describe("production credential hardening", () => {
  beforeAll(migrateDatabase);
  afterEach(() => vi.unstubAllEnvs());

  it("fails production bootstrap instead of creating a known default admin", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INITIAL_ADMIN_USERNAME", undefined);
    vi.stubEnv("INITIAL_ADMIN_PASSWORD", undefined);
    await expect(ensureDefaultAdminAccount()).rejects.toThrow("INITIAL_ADMIN_USERNAME");
  });

  it("does not bootstrap an administrator implicitly in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_DEV_ADMIN_BOOTSTRAP", "false");
    vi.stubEnv("INITIAL_ADMIN_USERNAME", undefined);
    vi.stubEnv("INITIAL_ADMIN_PASSWORD", undefined);
    await expect(ensureDefaultAdminAccount()).resolves.toBeUndefined();
  });

  it("returns 503 without exposing or falling back to a Neshan credential", async () => {
    vi.stubEnv("NESHAN_API_KEY", undefined);
    const response = await neshanRoute(new NextRequest("http://localhost/api/maps/neshan?action=search&term=test"));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toMatch(/Api-Key|credential|token/i);
  });

  it("rate-limits repeated login failures without storing raw identity data", async () => {
    const key = loginAttemptKey(`rate-${Date.now()}`, "198.51.100.8");
    await clearLoginFailures(key);
    for (let attempt = 0; attempt < 5; attempt++) await recordLoginFailure(key);
    await expect(assertLoginAllowed(key)).rejects.toMatchObject({ status: 429, code: "LOGIN_RATE_LIMITED" });
    await clearLoginFailures(key);
  });

  it("embeds an expiring issued-at instant in signed sessions", () => {
    vi.stubEnv("AUTH_SECRET", "test-secret-that-is-not-used-in-production");
    const employeeId = "00000000-0000-4000-8000-000000000001";
    const verified = verifySessionDetails(signSession(employeeId));
    expect(verified?.employeeId).toBe(employeeId);
    expect(verified?.issuedAt).toBeInstanceOf(Date);
  });

  it("keeps readiness false until every required migration is recorded", () => {
    expect(missingRequiredMigrations(requiredMigrationIds.slice(0, -1))).toEqual([requiredMigrationIds.at(-1)]);
    expect(missingRequiredMigrations(requiredMigrationIds)).toEqual([]);
  });
});
