import { beforeEach, describe, expect, it, vi } from "vitest";
import { canSeeAtelierSection } from "@/lib/atelierNavigation";
import { POST } from "@/app/api/ai/route";
import { availableAIOperations, executeAIOperation, prepareAIOperation } from "@/services/aiOperations";

const session = vi.hoisted(() => ({
  actor: null as null | { employeeId: string; employeeName: string; roleCode: string; permissions: Set<string> },
}));
vi.mock("@/services/access", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/services/access")>(),
  getEmployeeContext: async () => session.actor,
}));

function request(action: string) {
  return new Request("http://localhost/api/ai", { method: "POST", body: JSON.stringify({ action }) });
}

describe("AI administrator boundary", () => {
  beforeEach(() => {
    session.actor = {
      employeeId: "00000000-0000-4000-8000-000000000091",
      employeeName: "تست دستیار",
      roleCode: "personnel",
      permissions: new Set(["ai.view", "ai.use", "*"]),
    };
  });

  it("hides the AI section for non-admin roles even with direct grants", () => {
    expect(canSeeAtelierSection("ai", ["ai.view", "*"], "personnel")).toBe(false);
    expect(canSeeAtelierSection("ai", ["*"], "admin")).toBe(true);
  });

  it.each(["chat", "analysis", "operations", "prepare_operation", "execute_action"])(
    "rejects a non-admin direct request for %s",
    async action => expect((await POST(request(action))).status).toBe(403),
  );

  it("rejects unauthenticated calls", async () => {
    session.actor = null;
    expect((await POST(request("operations"))).status).toBe(401);
  });

  it("guards discovery, preparation and execution at the service boundary", async () => {
    const actor = session.actor!;
    await expect(availableAIOperations(actor)).rejects.toMatchObject({ status: 403 });
    await expect(prepareAIOperation(actor, "customers_list", {})).rejects.toMatchObject({ status: 403 });
    await expect(executeAIOperation(actor, "not-a-token", true)).rejects.toMatchObject({ status: 403 });
  });

  it("keeps access management out of administrator tool discovery", async () => {
    session.actor!.roleCode = "admin";
    const response = await POST(request("operations"));
    expect(response.status).toBe(200);
    const { operations } = await response.json();
    expect(operations.map((item: { operation: string }) => item.operation)).toContain("customers_list");
    expect(operations.map((item: { operation: string }) => item.operation)).not.toContain("personnel_access");
  });
});
