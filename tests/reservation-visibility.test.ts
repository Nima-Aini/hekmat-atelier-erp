import { beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
vi.mock("@/services/access", () => ({ getEmployeeContext: vi.fn() }));
import { reservationVisible } from "../src/services/studio/reservationAccess";
import { db } from "../src/db";
import { migrateDatabase } from "../src/db/migrate";
import { employees, studioReservations } from "../src/db/schema";
import { listReservations, saveReservation, deleteReservation } from "../src/services/studio/finalWorkflow";
const actor = (id: string, permissions: string[] = []) => ({ employeeId: id, employeeName: id, permissions: new Set(permissions) });
const row = { ownerEmployeeId: "owner", assignedPersonnelId: "person", viewerEmployeeIds: ["secretary"], sharedPersonnelIds: ["shared-person"] };
describe("Reservation ownership boundary", () => {
  it("owner sees own, explicit employee viewer sees shared", () => { expect(reservationVisible(actor("owner"), row)).toBe(true); expect(reservationVisible(actor("secretary"), row)).toBe(true); });
  it("assigned and shared personnel see the reservation", () => { expect(reservationVisible(actor("worker"), row, ["person"])).toBe(true); expect(reservationVisible(actor("worker"), row, ["shared-person"])).toBe(true); });
  it("unrelated personnel cannot access even with broad management permission", () => expect(reservationVisible(actor("other", ["studio.reservations.manage"]), row)).toBe(false));
  it("admin and explicit view_all see all", () => { expect(reservationVisible(actor("admin", ["*"]), row)).toBe(true); expect(reservationVisible(actor("manager", ["studio.reservations.view_all"]), row)).toBe(true); });
  it("ownerless historical data does not become globally visible", () => expect(reservationVisible(actor("other"), { ...row, ownerEmployeeId: null, viewerEmployeeIds: [], assignedPersonnelId: null, sharedPersonnelIds: [] })).toBe(false));
});
describe("Reservation SQL and direct mutation boundary", () => {
  const owner = actor(randomUUID(), ["studio.reservations.manage"]), viewer = actor(randomUUID()), unrelated = actor(randomUUID(), ["studio.reservations.manage"]);
  let id: string;
  beforeAll(async () => {
    await migrateDatabase();
    for (const person of [owner, viewer, unrelated]) await db.insert(employees).values({ id: person.employeeId, code: randomUUID(), name: "تست دسترسی", mobile: randomUUID() });
    const [row] = await db.insert(studioReservations).values({ title: "خصوصی", reservedAt: new Date(), customerName: "مشتری", mobile: "09120000000", ownerEmployeeId: owner.employeeId, viewerEmployeeIds: [viewer.employeeId] }).returning(); id = row.id;
  });
  it("filters SQL lists for owner/shared/unrelated", async () => {
    expect((await listReservations(true, owner)).some(r => r.id === id)).toBe(true);
    expect((await listReservations(true, viewer)).some(r => r.id === id)).toBe(true);
    expect((await listReservations(true, unrelated)).some(r => r.id === id)).toBe(false);
  });
  it("rejects direct foreign edit/delete even with management permission", async () => {
    await expect(deleteReservation(unrelated, id)).rejects.toThrow();
    await expect(saveReservation(unrelated, { title: "تغییر", date: new Date(), customerName: "مشتری", mobile: "09120000000" }, id)).rejects.toThrow();
  });
  it("preserves omitted sharing fields during a partial ownership update", async () => {
    await saveReservation(owner, {
      title: "خصوصی ویرایش‌شده", date: new Date(), customerName: "مشتری", mobile: "09120000000",
      ownerEmployeeId: owner.employeeId,
    }, id);
    const [updated] = await db.select().from(studioReservations).where(eq(studioReservations.id, id)).limit(1);
    expect(updated.viewerEmployeeIds).toEqual([viewer.employeeId]);
  });
});
