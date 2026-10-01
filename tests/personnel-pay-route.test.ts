import { describe, expect, it, vi } from "vitest";
vi.mock("@/services/studio/access", () => ({ requireStudioResourceAccess: vi.fn(async () => { const { ApiError } = await import("../src/lib/apiError"); throw new ApiError(403, "اجازه پرداخت ندارید."); }) }));
vi.mock("@/services/studio/financeCenter", () => ({ settleAtelierObligation: vi.fn() }));
import { POST } from "../src/app/api/atelier/personnel/[id]/finance/[salaryId]/pay/route";
import { settleAtelierObligation } from "../src/services/studio/financeCenter";
import { requireStudioResourceAccess } from "../src/services/studio/access";
describe("personnel payment direct API authorization", () => {
  it("rejects the request before posting and checks both salary scope and personnel parent", async () => {
    const result = await POST(new Request("http://localhost/api/pay", { method: "POST", body: "{}" }), { params: Promise.resolve({ id: "person", salaryId: "salary" }) });
    expect(result.status).toBe(403);
    expect(requireStudioResourceAccess).toHaveBeenCalledWith("salary", "salary", "studio.personnel.finance.pay", undefined, "person");
    expect(settleAtelierObligation).not.toHaveBeenCalled();
  });
});
