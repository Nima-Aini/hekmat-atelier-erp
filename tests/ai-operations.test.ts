import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { migrateDatabase } from "../src/db/migrate";
import { employees, auditLogs } from "../src/db/schema";
import { hasAtelierPermission } from "../src/lib/atelierPermissions";
import type { EmployeeContext } from "../src/services/access";
vi.mock("@/services/access", () => ({ canAccessPermission: async (actor: EmployeeContext, permission: string) => hasAtelierPermission(actor.permissions, permission) }));
import { AI_OPERATIONS, prepareAIOperation, executeAIOperation } from "../src/services/aiOperations";

const actor: EmployeeContext = { employeeId: "00000000-0000-4000-8000-000000000071", employeeName: "AI test", permissions: new Set(["ai.use", "studio.customers.edit", "studio.customers.view"]) };
let calls = 0;
describe("authenticated AI operations", () => {
  beforeAll(async () => {
    await migrateDatabase();
    await db.insert(employees).values({ id: actor.employeeId, code: "AI-TEST", name: "AI test", mobile: "09000000071" }).onConflictDoNothing();
    AI_OPERATIONS.test_write = { label: "Test mutation", permission: "studio.customers.edit", method: "POST", load: async () => ({ POST: async () => { calls++; return Response.json({ success: true }); } }) };
    AI_OPERATIONS.test_read = { label: "Test read", permission: "studio.customers.view", method: "GET", load: async () => ({ GET: async () => Response.json({ success: true, rows: ["allowed"] }) }) };
  });
  it("allows a permitted read without mutating", async () => {
    expect(await prepareAIOperation(actor, "test_read", {})).toEqual({ result: { success: true, rows: ["allowed"] } });
    expect(calls).toBe(0);
  });
  it("binds confirmation to actor, payload and one execution; audits success", async () => {
    const prepared = await prepareAIOperation(actor, "test_write", { input: { title: "original" } });
    const id = prepared.confirmation!.id;
    expect(calls).toBe(0);
    await expect(executeAIOperation(actor, id, false)).rejects.toThrow("تأیید");
    await expect(executeAIOperation({ ...actor, employeeId: "00000000-0000-4000-8000-000000000072" }, id, true)).rejects.toThrow("متعلق");
    await executeAIOperation(actor, id, true);
    expect(calls).toBe(1);
    await expect(executeAIOperation(actor, id, true)).rejects.toThrow("قبلاً");
    const audits = await db.select().from(auditLogs).where(eq(auditLogs.entityId, id));
    expect(audits.some(row => row.action === "AI_OPERATION_SUCCEEDED")).toBe(true);
  });
  it("rejects unknown operations and privilege escalation", async () => {
    await expect(prepareAIOperation(actor, "raw_sql", {})).rejects.toThrow("مجاز");
    await expect(prepareAIOperation(actor, "expense_create", {})).rejects.toThrow("مجاز");
  });
  it("rechecks revoked permission at execution and audits failure", async () => {
    const prepared = await prepareAIOperation(actor, "test_write", {});
    const id = prepared.confirmation!.id;
    await expect(executeAIOperation({ ...actor, permissions: new Set(["ai.use"]) }, id, true)).rejects.toThrow("مجاز");
    const audits = await db.select().from(auditLogs).where(eq(auditLogs.entityId, id));
    expect(audits.some(row => row.action === "AI_OPERATION_FAILED")).toBe(true);
    expect(calls).toBe(1);
  });
});
