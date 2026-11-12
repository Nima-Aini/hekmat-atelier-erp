import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { migrateDatabase } from "../src/db/migrate";
import { equipmentReservations, studioEquipment } from "../src/db/schema";
import { equipmentMaintenanceAlerts, getEquipmentUsage } from "../src/services/studio/equipmentCalendar";
import { reserveStudioEquipment } from "../src/services/studio/equipmentService";
import { filterNotifications, notificationCategory } from "../src/lib/atelierNotifications";

describe("equipment usage and categorized operational alerts", () => {
  beforeAll(migrateDatabase);
  it("reads authoritative multi-day usage with personnel/project data and enforces empty project scope", async () => {
    const id = randomUUID();
    await db.insert(studioEquipment).values({ id, code: `CAL-${id}`, title: "دوربین تقویم", category: "camera" });
    const from = new Date(Date.now() + 86400000), to = new Date(+from + 2 * 86400000);
    const [booking] = await db.insert(equipmentReservations).values({ equipmentId: id, reservedFrom: from, reservedTo: to }).returning();
    expect(await getEquipmentUsage(new Date(+from + 3600000), to, null, id)).toMatchObject([{ id: booking.id, equipmentTitle: "دوربین تقویم" }]);
    expect(await getEquipmentUsage(from, to, [], id)).toEqual([]);
    await db.update(studioEquipment).set({ currentHealthStatus: "damaged" }).where(eq(studioEquipment.id, id));
    const alert = (await equipmentMaintenanceAlerts(null)).find(row => row.entityId === id);
    expect(alert).toMatchObject({ priority: "critical", category: "equipment", affectedReservations: [{ id: booking.id }] });
    expect((await db.select().from(equipmentReservations).where(eq(equipmentReservations.id, booking.id)))[0].status).toBe("reserved");
    expect((await equipmentMaintenanceAlerts([])).some(row => row.entityId === id)).toBe(false);
    await expect(reserveStudioEquipment({ equipmentId: id, reservedFrom: new Date(+to + 3600000), reservedTo: new Date(+to + 7200000) })).rejects.toMatchObject({ code: "EQUIPMENT_NOT_HEALTHY" });
  });
  it("warns about maintenance without inventing bookings and rejects invalid calendar ranges", async () => {
    const id = randomUUID();
    await db.insert(studioEquipment).values({ id, code: `REPAIR-${id}`, title: "نور در تعمیر", category: "lighting", locationType: "maintenance" });
    expect((await equipmentMaintenanceAlerts(null)).find(row => row.entityId === id)).toMatchObject({ priority: "warning", affectedReservations: [] });
    await expect(getEquipmentUsage(new Date("invalid"), new Date(), null)).rejects.toMatchObject({ status: 400 });
  });
  it("filters category, unread and important states without conflating read with resolved", () => {
    const items = [{ category: "equipment", severity: "critical", readAt: null }, { category: "finance", severity: "info", readAt: null }, { category: "equipment", severity: "warning", readAt: new Date() }];
    expect(filterNotifications(items, "equipment", "unread")).toEqual([items[0]]);
    expect(filterNotifications(items, "all", "important")).toEqual([items[0], items[2]]);
    expect(notificationCategory("contract-due:123")).toBe("finance");
    expect(notificationCategory("reservation:123")).toBe("reservation");
  });
});
