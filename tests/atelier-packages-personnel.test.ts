import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { migrateDatabase } from "../src/db/migrate";
import {
  atelierExpenseSources,
  employeeAccounts,
  employees,
  expenses,
  studioContracts,
  studioDailyVisitPersonnel,
  studioPersonnel,
  studioProjectTypes,
} from "../src/db/schema";
import type { EmployeeContext } from "../src/services/access";
import { expandPackageToContractItems } from "../src/lib/atelierCatalog";
import { listAtelierCatalog, saveCatalog } from "../src/services/studio/catalog";
import { createStudioPersonnel, updateStudioPersonnel } from "../src/services/studio/personnelService";
import { employeePermissionSet } from "../src/services/partner";
import { getPersonnelAccess, savePersonnelAccess } from "../src/services/studio/personnelAccess";
import { createPendingContract, deleteDailyVisit, getContractById, listDailyVisits, saveDailyVisit, saveDailyVisitTitle } from "../src/services/studio/finalWorkflow";
import { canAccessPermission } from "../src/services/access";
import { visibleAtelierSections } from "../src/lib/atelierNavigation";

const actorId = "cf000000-0000-4000-8000-000000000009";
const actor: EmployeeContext = {
  employeeId: actorId,
  employeeName: "مدیر تست پکیج و پرسنل",
  permissions: new Set(["*"]),
};

describe("Atelier packages, personnel access, and daily visit workforce", () => {
  beforeAll(async () => {
    await migrateDatabase();
    await db.insert(employees).values({
      id: actorId,
      code: "PACKAGES-PERSONNEL-OWNER",
      name: actor.employeeName,
      mobile: "09000000029",
      status: "active",
    }).onConflictDoNothing();
  });

  it("manages reusable items and expands a package into independent contract snapshots", async () => {
    const photo = await saveCatalog(actor, {
      kind: "service",
      name: `عکاسی ${randomUUID().slice(0, 4)}`,
      basePrice: 4_000_000,
      active: true,
      sortOrder: 10,
    });
    const edit = await saveCatalog(actor, {
      kind: "service",
      name: `تدوین ${randomUUID().slice(0, 4)}`,
      basePrice: 2_000_000,
      active: true,
      sortOrder: 20,
    });
    const pack = await saveCatalog(actor, {
      kind: "package",
      name: `پکیج تست ${randomUUID().slice(0, 4)}`,
      specifications: { itemIds: [photo.id, edit.id] },
      active: true,
      sortOrder: 30,
    });
    const catalog = await listAtelierCatalog(true);
    const snapshots = expandPackageToContractItems(
      catalog.find((row) => row.id === pack.id)!,
      catalog,
    );
    expect(snapshots.map((row) => row.title)).toEqual([photo.name, edit.name]);
    expect(snapshots.reduce((sum, row) => sum + row.unitPrice, 0)).toBe(6_000_000);
    const [projectType] = await db.select().from(studioProjectTypes).where(eq(studioProjectTypes.code, "wedding")).limit(1);
    const selected = [
      { ...snapshots[0], unitPrice: 4_500_000 },
      { title: "آیتم سفارشی کرین", description: "", quantity: 1, unitPrice: 1_500_000, notes: "" },
    ];
    const contract = await createPendingContract(actor, {
      idempotencyKey: randomUUID(),
      projectTypeId: projectType.id,
      customerName: "مشتری پکیج snapshot",
      mobile: `0911${Date.now().toString().slice(-7)}`,
      programDate: new Date(Date.now() + 86_400_000),
      items: selected,
      paidAmount: 0,
    });
    await saveCatalog(actor, { ...photo, basePrice: 9_000_000, specifications: photo.specifications || {} }, photo.id);
    expect(snapshots[0].unitPrice).toBe(4_000_000);
    const historical = await getContractById(contract.id);
    expect(historical.items).toHaveLength(2);
    expect(Number(historical.items[0].unitPrice)).toBe(4_500_000);
    expect(historical.items[1].title).toBe("آیتم سفارشی کرین");
    expect((await db.select().from(studioContracts).where(eq(studioContracts.id, contract.id)))[0]).toBeTruthy();
  });

  it("stores fixed salary without creating a financial expense and grants only selected panel permissions", async () => {
    const person = await createStudioPersonnel({
      fullName: "پرسنل دسترسی محدود",
      mobile: `0912${Date.now().toString().slice(-7)}`,
      personnelType: "employee",
      primaryRole: "photographer",
      fixedSalary: 18_000_000,
      paymentCycle: "monthly",
      status: "active",
    });
    const expenseCountBefore = (await db.select().from(expenses)).length;
    await updateStudioPersonnel(person.id, { fixedSalary: 20_000_000 });
    const [stored] = await db.select().from(studioPersonnel).where(eq(studioPersonnel.id, person.id));
    expect(Number(stored.fixedSalary)).toBe(20_000_000);
    expect((await db.select().from(expenses)).length).toBe(expenseCountBefore);

    const username = `atelier-${randomUUID().slice(0, 8)}`;
    await savePersonnelAccess(actor, person.id, {
      username,
      password: "Secure-Test-Password-29",
      status: "active",
      permissions: ["studio.dashboard.view", "studio.calendar.view"],
    });
    const access = await getPersonnelAccess(person.id);
    expect(access.account).toMatchObject({ username, status: "active" });
    expect(access.permissions.sort()).toEqual(["studio.calendar.view", "studio.dashboard.view"]);
    const [linked] = await db.select().from(studioPersonnel).where(eq(studioPersonnel.id, person.id));
    expect(linked.employeeId).toBeTruthy();
    expect((await employeePermissionSet(linked.employeeId!)).map((row) => row.code).sort()).toEqual(["studio.calendar.view", "studio.dashboard.view"]);
    const [account] = await db.select().from(employeeAccounts).where(eq(employeeAccounts.employeeId, linked.employeeId!));
    expect(account.passwordHash).not.toContain("Secure-Test-Password-29");
    const limited: EmployeeContext = { employeeId: linked.employeeId!, employeeName: person.fullName, permissions: new Set(access.permissions) };
    expect(await canAccessPermission(limited, "studio.contract.view")).toBe(false);
    expect(await canAccessPermission(limited, "studio.calendar.view")).toBe(true);
    expect(visibleAtelierSections(["dashboard", "contracts", "planning", "calendar", "settings"], access.permissions)).toEqual(["dashboard", "calendar"]);
    expect(visibleAtelierSections(["dashboard", "contracts"], ["*"])).toEqual(["dashboard", "contracts"]);
    await expect(savePersonnelAccess(limited, person.id, { username, permissions: ["*"] })).rejects.toThrow("خودتان");

    await savePersonnelAccess(actor, person.id, { username, status: "inactive", permissions: ["studio.dashboard.view"] });
    const disabled = await getPersonnelAccess(person.id);
    expect(disabled.account?.status).toBe("inactive");
    expect(disabled.permissions).toEqual(["studio.dashboard.view"]);
    expect((await employeePermissionSet(linked.employeeId!)).map((row) => row.code)).toEqual(["studio.dashboard.view"]);
  });

  it("records multiple daily-visit wage snapshots as canonical unpaid expenses and reverses them on safe deletion", async () => {
    await saveDailyVisitTitle(actor, { title: `عکس فوری ${randomUUID().slice(0, 4)}`, active: true, sortOrder: 10 });
    const first = await createStudioPersonnel({ fullName: "عکاس مراجعه", mobile: `0935${Date.now().toString().slice(-7)}`, personnelType: "temporary_worker", primaryRole: "photographer", status: "active" });
    const second = await createStudioPersonnel({ fullName: "رتوش‌گر مراجعه", mobile: `0936${Date.now().toString().slice(-7)}`, personnelType: "temporary_worker", primaryRole: "retoucher", status: "active" });
    const visit = await saveDailyVisit(actor, {
      title: "عکس فوری",
      date: new Date(),
      price: 3_000_000,
      paidAmount: 0,
      customerName: "مشتری مراجعه چندنفره",
      mobile: `0991${Date.now().toString().slice(-7)}`,
      personnelAssignments: [
        { personnelId: first.id, workTitle: "عکاسی", wageAmount: 700_000 },
        { personnelId: second.id, workTitle: "رتوش", wageAmount: 300_000 },
      ],
    });
    expect(visit.personnelCost).toBe(1_000_000);
    expect(visit.preliminaryProfit).toBe(2_000_000);
    const assignments = await db.select().from(studioDailyVisitPersonnel).where(and(eq(studioDailyVisitPersonnel.dailyVisitId, visit.id), eq(studioDailyVisitPersonnel.status, "active")));
    expect(assignments).toHaveLength(2);
    for (const assignment of assignments) {
      const [source] = await db.select().from(atelierExpenseSources).where(and(eq(atelierExpenseSources.sourceType, "personnel_wage"), eq(atelierExpenseSources.sourceId, assignment.salaryRecordId!)));
      const [expense] = await db.select().from(expenses).where(eq(expenses.id, source.expenseId));
      expect(expense).toMatchObject({ paymentStatus: "unpaid", paidAmount: "0.00" });
    }
    const listed = (await listDailyVisits()).find((row) => row.id === visit.id)!;
    expect(listed.personnelCost).toBe(1_000_000);
    const edited = await saveDailyVisit(actor, {
      title: visit.title,
      date: visit.visitDate,
      price: Number(visit.price),
      paidAmount: 0,
      customerName: visit.customerName,
      mobile: visit.mobile,
      personnelAssignments: [
        { id: assignments[0].id, personnelId: first.id, workTitle: "عکاسی و نور", wageAmount: 800_000 },
      ],
    }, visit.id);
    expect(edited.personnelCost).toBe(800_000);
    expect(edited.preliminaryProfit).toBe(2_200_000);
    const afterEdit = await db.select().from(studioDailyVisitPersonnel).where(eq(studioDailyVisitPersonnel.dailyVisitId, visit.id));
    expect(afterEdit.filter((row) => row.status === "active")).toHaveLength(1);
    expect(afterEdit.find((row) => row.id === assignments[1].id)?.status).toBe("removed");
    await deleteDailyVisit(actor, visit.id);
    const removed = await db.select().from(studioDailyVisitPersonnel).where(eq(studioDailyVisitPersonnel.dailyVisitId, visit.id));
    expect(removed.every((row) => row.status === "removed")).toBe(true);
    for (const assignment of removed) {
      const [source] = await db.select().from(atelierExpenseSources).where(and(eq(atelierExpenseSources.sourceType, "personnel_wage"), eq(atelierExpenseSources.sourceId, assignment.salaryRecordId!)));
      const [expense] = await db.select().from(expenses).where(eq(expenses.id, source.expenseId));
      expect(expense.status).toBe("reversed");
    }
  });
});
