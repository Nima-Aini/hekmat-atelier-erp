import { beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
vi.mock("@/services/access", () => ({ getEmployeeContext: vi.fn() }));
import { db } from "../src/db";
import { migrateDatabase } from "../src/db/migrate";
import { employees, studioPersonnel } from "../src/db/schema";
import { saveReservation, listReservations, deleteReservation } from "../src/services/studio/finalWorkflow";
const makeActor = (permissions: string[] = []) => ({ employeeId: randomUUID(), employeeName: "تست", permissions: new Set(permissions) });
describe("administrator-controlled personnel delegation", () => {
 const admin = makeActor(["*"]), selected = makeActor(["studio.reservations.edit"]), selected2 = makeActor(["studio.reservations.edit"]), outsider = makeActor(["studio.reservations.edit"]);
 let personId: string; let personId2: string; let reservationId: string;
 const body = () => ({ title: "رزرو تست مدیریت", date: "2035-01-01T06:30:00Z", customerName: "مشتری", mobile: "09120000000" });
 beforeAll(async () => { await migrateDatabase(); for (const actor of [admin, selected, selected2, outsider]) await db.insert(employees).values({ id: actor.employeeId, code: randomUUID(), name: actor.employeeName, mobile: randomUUID() }); const [person] = await db.insert(studioPersonnel).values({ employeeId: selected.employeeId, fullName: "پرسنل منتخب", mobile: "09120000000", primaryRole: "photographer" }).returning(); personId = person.id; const [person2] = await db.insert(studioPersonnel).values({ employeeId: selected2.employeeId, fullName: "پرسنل دوم", mobile: "09120000001", primaryRole: "photographer" }).returning(); personId2 = person2.id; }, 60000);
 it("deduplicates assignments and lets only selected personnel edit", async () => {
   const row = await saveReservation(admin, { ...body(), managerPersonnelIds: [personId, personId, personId2] }); reservationId = row.id;
   expect((await listReservations(true, selected)).find(r => r.id === row.id)?.managerPersonnelIds).toEqual(expect.arrayContaining([personId, personId2]));
   await expect(saveReservation(selected2, body(), row.id)).resolves.toMatchObject({ id: row.id });
   await expect(saveReservation(selected, body(), row.id)).resolves.toMatchObject({ id: row.id });
   await expect(saveReservation(outsider, body(), row.id)).rejects.toThrow();
   await expect(saveReservation(selected, { ...body(), managerPersonnelIds: [] }, row.id)).rejects.toThrow();
   await expect(deleteReservation(selected, row.id)).rejects.toThrow();
 });
 it("revokes access immediately", async () => { await saveReservation(admin, { ...body(), managerPersonnelIds: [] }, reservationId); await expect(saveReservation(selected, body(), reservationId)).rejects.toThrow(); });
});
