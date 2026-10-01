import { beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
const state = vi.hoisted(() => ({ employeeId: "fe000000-0000-4000-8000-000000000001" }));
vi.mock("@/services/studio/access", () => ({ requireStudioCustomerAccess: vi.fn(async () => ({ employeeId: state.employeeId, employeeName: "تست", permissions: new Set(["*"]) })), requireStudioProjectAccess: vi.fn(async () => ({})) }));
import { db } from "../src/db";
import { migrateDatabase } from "../src/db/migrate";
import { customers, studioCustomers, employees, studioCustomerTasks, studioProjects, studioTasks } from "../src/db/schema";
import { saveCustomerTask } from "../src/services/studio/customerTasks";
describe("Customer manual task source isolation", () => {
  let customerId: string;
  beforeAll(async () => {
    await migrateDatabase();
    await db.insert(employees).values({ id: state.employeeId, code: randomUUID(), name: "تست کار", mobile: "09010000881" });
    const [customer] = await db.insert(customers).values({ code: randomUUID(), name: "تست کار", mobile: "09120000881" }).returning();
    const [studio] = await db.insert(studioCustomers).values({ customerId: customer.id }).returning(); customerId = studio.id;
  });
  it("creates manual task and changes only its own status", async () => {
    const a = await saveCustomerTask(customerId, { title: "خدمت دستی", date: "2035-01-01" });
    const b = await saveCustomerTask(customerId, { title: "خدمت دیگر" });
    await saveCustomerTask(customerId, { id: a.id, status: "done" });
    expect((await db.select().from(studioCustomerTasks).where(eq(studioCustomerTasks.id, a.id)))[0].status).toBe("done");
    expect((await db.select().from(studioCustomerTasks).where(eq(studioCustomerTasks.id, b.id)))[0].status).toBe("pending");
  });
  it("rejects contract cancellation through task status", async () => await expect(saveCustomerTask(customerId, { sourceType: "contract", sourceId: randomUUID(), status: "cancelled" })).rejects.toMatchObject({ code: "SOURCE_WORKFLOW_REQUIRED" }));
  it("updates the authoritative Planning task without creating a duplicate manual record", async () => {
    const [project] = await db.insert(studioProjects).values({ studioCustomerId: customerId, projectNumber: randomUUID(), title: "پروژه کار", eventDate: new Date() }).returning();
    const [task] = await db.insert(studioTasks).values({ studioProjectId: project.id, title: "کار منبع" }).returning();
    const before = (await db.select().from(studioCustomerTasks)).length;
    await saveCustomerTask(customerId, { sourceType: "task", sourceId: task.id, status: "done" });
    const [saved] = await db.select().from(studioTasks).where(eq(studioTasks.id, task.id));
    expect(saved.status).toBe("done"); expect(saved.completedAt).not.toBeNull();
    expect((await db.select().from(studioCustomerTasks)).length).toBe(before);
  });
  it("rejects invalid status and foreign projects", async () => {
    await expect(saveCustomerTask(customerId, { title: "bad", status: "paid" })).rejects.toThrow();
    await expect(saveCustomerTask(customerId, { title: "bad", projectId: randomUUID() })).rejects.toThrow();
  });
});
