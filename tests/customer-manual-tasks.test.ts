import { beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
const state = vi.hoisted(() => ({ employeeId: "fe000000-0000-4000-8000-000000000001", permissions: ["*"] as string[] }));
vi.mock("@/services/studio/access", () => ({ requireStudioCustomerAccess: vi.fn(async () => ({ employeeId: state.employeeId, employeeName: "تست", permissions: new Set(state.permissions) })), requireStudioProjectAccess: vi.fn(async () => ({})) }));
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
  it("rejects direct creation by personnel with planning permissions", async () => {
    state.permissions = ["studio.planning.manage"];
    try { await expect(saveCustomerTask(customerId, { title: "غیرمجاز" })).rejects.toMatchObject({ code: "ADMIN_REQUIRED" }); } finally { state.permissions = ["*"]; }
  });
  it("rejects invalid status and foreign projects", async () => {
    await expect(saveCustomerTask(customerId, { title: "bad", status: "paid" })).rejects.toThrow();
    await expect(saveCustomerTask(customerId, { title: "bad", projectId: randomUUID() })).rejects.toThrow();
  });
});

describe("manual service reminder lifecycle", () => {
  it("updates one reminder on edit and resolves it on cancellation", async () => {
    const { studioNotifications } = await import("../src/db/schema");
    const [customer] = await db.insert(customers).values({ code: randomUUID(), name: "یادآوری دستی", mobile: "09120000882" }).returning();
    const [studio] = await db.insert(studioCustomers).values({ customerId: customer.id }).returning();
    const task = await saveCustomerTask(studio.id, { title: "انتخاب عکس", date: "2035-01-01T06:30:00Z" });
    const read = () => db.select().from(studioNotifications).where(eq(studioNotifications.conditionKey, `customer-service:${task.id}`));
    const original = (await read())[0];
    await saveCustomerTask(studio.id, { id: task.id, title: "انتخاب آلبوم", date: "2035-01-02T06:30:00Z" });
    const edited = await read(); expect(edited).toHaveLength(1); expect(edited[0].id).toBe(original.id); expect(edited[0].messageText).toBe("انتخاب آلبوم"); expect(edited[0].scheduledFor.toISOString()).toBe("2035-01-02T06:30:00.000Z");
    await saveCustomerTask(studio.id, { id: task.id, status: "cancelled" });
    expect((await read())[0].resolvedAt).not.toBeNull();
  });
});
