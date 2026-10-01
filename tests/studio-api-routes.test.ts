import { beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { migrateDatabase } from "../src/db/migrate";
import { auditLogs, employees, equipmentReservations, studioCalendarEvents, studioProjectExpenses, studioProjectTimelines } from "../src/db/schema";
import { createStudioCustomer } from "../src/services/studio/customerService";
import { createStudioEquipment } from "../src/services/studio/equipmentService";
import { createStudioProject } from "../src/services/studio/projectService";
import { createStudioPersonnel } from "../src/services/studio/personnelService";

const accessState = vi.hoisted(() => ({ denied: false, calls: [] as Array<[string, string | null | undefined]> }));
vi.mock("@/services/access", async () => {
  const { ApiError } = await import("../src/lib/apiError");
  return {
    requirePermission: vi.fn(async (permission: string, projectId?: string | null) => {
      accessState.calls.push([permission, projectId]);
      if (accessState.denied) throw new ApiError(403, "دسترسی مجاز نیست");
      return { employeeId: "00000000-0000-4000-8000-000000000001", employeeName: "کاربر آزمون", permissions: new Set([permission]) };
    }),
  };
});

import { POST as saveExecution } from "../src/app/api/studio/projects/[id]/execution/route";
import { DELETE as cancelCalendarEvent } from "../src/app/api/studio/calendar/[id]/route";
import { DELETE as deleteProjectExpense } from "../src/app/api/studio/projects/[id]/expenses/route";

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (body: unknown) => new NextRequest("http://localhost/api/studio/execution", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("Studio execution and calendar routes", () => {
  beforeAll(async () => {
    await migrateDatabase();
    await db.insert(employees).values({ id: "00000000-0000-4000-8000-000000000001", code: "TEST-ACTOR", name: "کاربر آزمون", mobile: "09000000001", status: "active" }).onConflictDoNothing();
  });

  it("creates, updates and cancels an execution plan without deleting history", async () => {
    const suffix = Date.now().toString().slice(-7);
    const customer = await createStudioCustomer({ name: "مشتری برنامه اجرا", mobile: `0913${suffix}` });
    const project = await createStudioProject({ studioCustomerId: customer.id, title: "پروژه برنامه اجرا", eventDate: "2026-11-10" });
    const equipment = await createStudioEquipment({ title: "دوربین برنامه اجرا", category: "camera" });

    const createResponse = await saveExecution(request({
      title: "اجرای اصلی",
      startTime: "2026-11-10T08:00:00.000Z",
      endTime: "2026-11-10T12:00:00.000Z",
      equipmentIds: [equipment.id],
      authorName: "Admin Spoofed",
    }), params(project.id));
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()).event;
    const [timeline] = await db.select().from(studioProjectTimelines).where(and(eq(studioProjectTimelines.studioProjectId, project.id), eq(studioProjectTimelines.actionType, "EXECUTION_CREATED")));
    expect(timeline.authorName).toBe("کاربر آزمون");
    expect(timeline.actorEmployeeId).toBe("00000000-0000-4000-8000-000000000001");
    const [audit] = await db.select().from(auditLogs).where(eq(auditLogs.entityId, created.id));
    expect(audit.userName).toBe("کاربر آزمون");
    expect(accessState.calls.at(-1)).toEqual(["studio.production.manage", project.projectId]);

    const updateResponse = await saveExecution(request({
      eventId: created.id,
      title: "اجرای اصلاح‌شده",
      startTime: "2026-11-10T09:00:00.000Z",
      endTime: "2026-11-10T13:00:00.000Z",
      equipmentIds: [equipment.id],
    }), params(project.id));
    expect(updateResponse.status).toBe(200);
    expect((await updateResponse.json()).event.title).toBe("اجرای اصلاح‌شده");

    const cancelResponse = await cancelCalendarEvent(
      new NextRequest(`http://localhost/api/studio/calendar/${created.id}`, { method: "DELETE" }),
      params(created.id)
    );
    expect(cancelResponse.status).toBe(200);
    expect((await cancelResponse.json()).event.status).toBe("cancelled");
    expect(await db.select().from(studioCalendarEvents).where(eq(studioCalendarEvents.id, created.id))).toHaveLength(1);
    const reservations = await db.select().from(equipmentReservations).where(eq(equipmentReservations.studioProjectId, project.id));
    expect(reservations.every((row) => row.status === "cancelled")).toBe(true);
  });

  it("returns 403 for a project-scoped unauthorized actor", async () => {
    const [event] = await db.select().from(studioCalendarEvents).limit(1);
    accessState.denied = true;
    try {
      const response = await cancelCalendarEvent(
        new NextRequest(`http://localhost/api/studio/calendar/${event.id}`, { method: "DELETE" }),
        params(event.id)
      );
      expect(response.status).toBe(403);
    } finally {
      accessState.denied = false;
    }
  });

  it("prevents concurrent personnel double-booking", async () => {
    const suffix = Date.now().toString().slice(-7);
    const customer = await createStudioCustomer({ name: "مشتری تداخل عوامل", mobile: `0935${suffix}` });
    const firstProject = await createStudioProject({ studioCustomerId: customer.id, title: "اجرای همزمان اول", eventDate: "2027-01-10" });
    const secondProject = await createStudioProject({ studioCustomerId: customer.id, title: "اجرای همزمان دوم", eventDate: "2027-01-10" });
    const person = await createStudioPersonnel({ fullName: "عامل تست همزمان", mobile: `0921${suffix}`, primaryRole: "photographer" });
    const body = { title: "اجرای همزمان", startTime: "2027-01-10T08:00:00.000Z", endTime: "2027-01-10T12:00:00.000Z", assignedPersonnelIds: [person.id] };
    const responses = await Promise.all([
      saveExecution(request(body), params(firstProject.id)),
      saveExecution(request(body), params(secondProject.id)),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
  });

  it("rejects an indirect child ID that belongs to a different project", async () => {
    const suffix = Date.now().toString().slice(-7);
    const customer = await createStudioCustomer({ name: "مشتری IDOR", mobile: `0936${suffix}` });
    const allowedProject = await createStudioProject({ studioCustomerId: customer.id, title: "پروژه مجاز", eventDate: "2027-02-10" });
    const otherProject = await createStudioProject({ studioCustomerId: customer.id, title: "پروژه دیگر", eventDate: "2027-02-11" });
    const [expense] = await db.insert(studioProjectExpenses).values({ studioProjectId: otherProject.id, title: "پیش‌نویس", amount: "100", paymentStatus: "pending" }).returning();
    const response = await deleteProjectExpense(new NextRequest(`http://localhost/api/studio/projects/${allowedProject.id}/expenses?expenseId=${expense.id}`, { method: "DELETE" }), params(allowedProject.id));
    expect(response.status).toBe(404);
    expect(await db.select().from(studioProjectExpenses).where(eq(studioProjectExpenses.id, expense.id))).toHaveLength(1);
  });
});
