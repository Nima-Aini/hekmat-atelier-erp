import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ auth: 200, finance: true, scopedFinance: true, ids: ["dd000000-0000-4000-8000-000000000001"] as string[] | null }));
vi.mock("@/services/access", async () => {
  const { ApiError } = await import("../src/lib/apiError");
  return {
    requireAnyPermission: vi.fn(async () => {
      if (state.auth !== 200) throw new ApiError(state.auth, "دسترسی مجاز نیست");
      return { employeeId: "dd000000-0000-4000-8000-000000000002", employeeName: "تست", permissions: new Set(["studio.dashboard.view"]) };
    }),
    getScopedProjectIds: vi.fn(async () => state.ids),
    canAccessPermission: vi.fn(async (_actor: unknown, permission: string, projectId?: string) => permission === "studio.finance.view" ? projectId ? state.scopedFinance : state.finance : true),
  };
});
vi.mock("@/services/studio/finalInsights", () => ({ getFinalDashboard: vi.fn(async () => ({ overview: { contractCount: 0 } })) }));
import { GET } from "../src/app/api/atelier/dashboard/route";
import { getFinalDashboard } from "../src/services/studio/finalInsights";
const request = (query = "") => new Request(`http://localhost/api/atelier/dashboard${query}`);
beforeEach(() => { state.auth = 200; state.finance = true; state.scopedFinance = true; state.ids = ["dd000000-0000-4000-8000-000000000001"]; vi.clearAllMocks(); });
describe("Dashboard API direct access", () => {
  it.each([401, 403])("rejects missing/expired session or missing permission with %s", async status => { state.auth = status; expect((await GET(request())).status).toBe(status); expect(getFinalDashboard).not.toHaveBeenCalled(); });
  it.each(["?startDate=bad&endDate=2026-01-01", "?startDate=2026-01-01", "?startDate=2026-02-31&endDate=2026-03-01", "?startDate=2026-02-01&endDate=2026-01-01", "?projectId=bad"]) ("rejects invalid inputs %s", async query => { expect((await GET(request(query))).status).toBe(400); expect(getFinalDashboard).not.toHaveBeenCalled(); });
  it("rejects cross-project requests before loading any data", async () => { expect((await GET(request("?projectId=dd000000-0000-4000-8000-000000000009"))).status).toBe(403); expect(getFinalDashboard).not.toHaveBeenCalled(); });
  it("forwards project and inclusive civil range together", async () => {
    expect((await GET(request("?projectId=dd000000-0000-4000-8000-000000000001&startDate=1405/01/01&endDate=1405/01/02"))).status).toBe(200);
    expect(getFinalDashboard).toHaveBeenCalledWith(state.ids, true, expect.objectContaining({ projectId: state.ids![0], range: { start: new Date("2026-03-20T20:30:00Z"), end: new Date("2026-03-22T20:29:59.999Z") } }));
  });
  it("honors finance denial on an otherwise accessible project", async () => {
    state.scopedFinance = false;
    expect((await GET(request("?projectId=dd000000-0000-4000-8000-000000000001"))).status).toBe(200);
    expect(getFinalDashboard).toHaveBeenCalledWith(state.ids, false, expect.objectContaining({ financeProjectIds: [] }));
  });
});
