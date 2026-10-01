import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ allowed: false }));

vi.mock("@/services/access", async () => {
  const { ApiError } = await import("../src/lib/apiError");
  return {
    requirePermission: vi.fn(async (permission: string) => {
      if (!state.allowed || permission !== "studio.contract.view")
        throw new ApiError(403, "دسترسی مجاز نیست", "PERMISSION_REQUIRED");
      return {
        employeeId: "ce000000-0000-4000-8000-000000000009",
        employeeName: "پرسنل محدود",
        permissions: new Set(["studio.contract.view"]),
      };
    }),
    getScopedProjectIds: vi.fn(async () => []),
    canAccessPermission: vi.fn(async () => false),
  };
});

vi.mock("@/services/studio/finalWorkflow", () => ({
  listContracts: vi.fn(async () => []),
  createPendingContract: vi.fn(),
}));

import { GET } from "../src/app/api/atelier/contracts/route";

describe("Personnel API permission enforcement", () => {
  it("returns 403 for direct contracts API access without the contract permission", async () => {
    state.allowed = false;
    const response = await GET(new Request("http://localhost/api/atelier/contracts") as any);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ success: false, code: "PERMISSION_REQUIRED" });
  });

  it("allows the same endpoint after the exact permission is granted", async () => {
    state.allowed = true;
    const response = await GET(new Request("http://localhost/api/atelier/contracts") as any);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, contracts: [] });
  });
});
