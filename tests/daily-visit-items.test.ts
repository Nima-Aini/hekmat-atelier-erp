import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { migrateDatabase } from "../src/db/migrate";
import { employees, invoices, studioDailyVisits } from "../src/db/schema";
import { saveDailyVisit, saveDailyVisitTitle } from "../src/services/studio/finalWorkflow";
import { normalizeDailyVisitOptions, resolveDailyVisitItem } from "../src/lib/dailyVisitItems";
import type { EmployeeContext } from "../src/services/access";

const actor: EmployeeContext = { employeeId: randomUUID(), employeeName: "آزمون آیتم مراجعه", permissions: new Set(["*"]) };
const option = { key: "print-medium", title: "چاپ متوسط", active: true, sortOrder: 0, defaultPrice: "500000.00" };

describe("daily visit item configuration and canonical snapshots", () => {
  beforeAll(async () => {
    await migrateDatabase();
    await db.insert(employees).values({ id: actor.employeeId, name: actor.employeeName, code: `ITEM-${randomUUID()}`, mobile: "09000000012", status: "active" });
  });

  it("validates duplicate keys and rejects invalid prices", () => {
    expect(() => normalizeDailyVisitOptions([option, option])).toThrow();
    expect(() => normalizeDailyVisitOptions([{ ...option, defaultPrice: -1 }])).toThrow();
  });

  it("suggests parent/option prices but accepts a transaction override", () => {
    const item = { id: randomUUID(), title: "چاپ", active: true, mode: "simple", defaultPrice: "100000.00", secondaryOptions: [] };
    expect(resolveDailyVisitItem(item, null, undefined).price).toBe("100000.00");
    const staged = { ...item, mode: "secondary_options", secondaryOptions: [option] };
    expect(resolveDailyVisitItem(staged, option.key, undefined).price).toBe("500000.00");
    expect(resolveDailyVisitItem(staged, option.key, 420000).price).toBe("420000.00");
    expect(() => resolveDailyVisitItem(staged, null, 1)).toThrow();
    expect(() => resolveDailyVisitItem({ ...staged, active: false }, option.key, 1)).toThrow();
  });

  it("stores selected titles and price independently and preserves them when settings change", async () => {
    const title = `چاپ ${randomUUID()}`;
    const item = await saveDailyVisitTitle(actor, { title, mode: "secondary_options", secondaryOptions: [option] });
    const input = { itemId: item.id, optionKey: option.key, price: 425000, date: new Date(), customerName: "مشتری تست", mobile: "09123456781", paidAmount: 0, idempotencyKey: randomUUID() };
    const visit = await saveDailyVisit(actor, input);
    expect(visit.price).toBe("425000.00");
    expect(visit.itemSnapshot).toMatchObject({ itemId: item.id, itemTitle: title, optionTitle: option.title, optionKey: option.key });
    await saveDailyVisitTitle(actor, { title: `${title} جدید`, active: false, secondaryOptions: [{ ...option, title: "قیمت جدید", defaultPrice: "900000", active: false }] }, item.id);
    const replay = await saveDailyVisit(actor, input);
    expect(replay.id).toBe(visit.id);
    const edited = await saveDailyVisit(actor, { ...input, notes: "فقط یادداشت" }, visit.id);
    expect(edited.title).toBe(visit.title);
    expect(edited.itemSnapshot).toEqual(visit.itemSnapshot);
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, visit.invoiceId!));
    expect(Number(invoice.grandTotal)).toBe(425000);
    const [stored] = await db.select().from(studioDailyVisits).where(eq(studioDailyVisits.id, visit.id));
    expect(stored.price).toBe("425000.00");
    await expect(saveDailyVisit(actor, { ...input, idempotencyKey: randomUUID() })).rejects.toThrow();
  });

  it("rejects inactive secondary options on new records even with a forged title", async () => {
    const item = await saveDailyVisitTitle(actor, { title: randomUUID(), mode: "secondary_options", secondaryOptions: [option, { ...option, key: "disabled", active: false }] });
    await expect(saveDailyVisit(actor, { itemId: item.id, optionKey: "disabled", title: "جعلی", price: 50, date: new Date(), customerName: "تست", mobile: "09123456782", paidAmount: 0 })).rejects.toThrow();
  });
});
