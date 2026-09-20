import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../src/db";
import { migrateDatabase } from "../src/db/migrate";
import {
  accountBalanceAdjustments, accounts, atelierExpenseSources, auditLogs, customers, employees, equipmentReservations, expenses, invoices, rentalEquipment,
  studioCalendarEvents, studioContracts, studioCustomers, studioDailyVisits, studioEquipment,
  studioInstallmentAllocations, studioInstallments, studioPersonnel, studioPlanningPersonnel, studioProjectTypes, studioReservations,
} from "../src/db/schema";
import type { EmployeeContext } from "../src/services/access";
import {
  addRentalRequirement, approveContract, assignEquipmentToItem, assignPersonnelToItem,
  completeReservation, convertReservationToDailyVisit, createPendingContract, getPlanning, listDailyVisits, listReservations,
  markRentalAsRented, saveDailyVisit, saveReservation, updateContract, updatePersonnelAssignment, deletePersonnelAssignment,
  updateEquipmentAssignment, deleteEquipmentAssignment,
} from "../src/services/studio/finalWorkflow";
import { getFinalCalendar, getFinalNotifications, listContractCustomers, setNotificationArchived } from "../src/services/studio/finalInsights";
import { createStudioEquipment } from "../src/services/studio/equipmentService";
import { createStudioPersonnel } from "../src/services/studio/personnelService";
import { adjustAtelierAccountBalance, getAtelierFinanceCenter, payAtelierInstallment, recordAtelierReceipt, saveContractInstallments, updateContractFinance } from "../src/services/studio/financeCenter";

const actorId = "c7000000-0000-4000-8000-000000000001";
const actor: EmployeeContext = { employeeId: actorId, employeeName: "مدیر تست جریان نهایی", permissions: new Set(["*"]) };
const tomorrow = () => new Date(Date.now() + 36 * 60 * 60 * 1000);

describe("Final Iranian atelier workflow", () => {
  let typeId = "";
  let accountId = "";
  let contract: any;

  beforeAll(async () => {
    await migrateDatabase();
    await db.insert(employees).values({ id: actorId, code: "FINAL-ATELIER-OWNER", name: actor.employeeName, mobile: "09000000017", status: "active" }).onConflictDoNothing();
    const [type] = await db.select().from(studioProjectTypes).where(eq(studioProjectTypes.code, "wedding")).limit(1);
    typeId = type.id;
    accountId = randomUUID();
    await db.insert(accounts).values({ id: accountId, code: `FINAL-${Date.now()}`, name: "حساب دریافت قرارداد نهایی", type: "bank", balance: "500000000", status: "active" });
  });

  it("creates a pending typed contract with canonical server-side financial values and no duplicate client", async () => {
    const mobile = `0914${Date.now().toString().slice(-7)}`;
    const date = tomorrow();
    contract = await createPendingContract(actor, {
      idempotencyKey: randomUUID(), projectTypeId: typeId, customerName: "احمد و سارا", mobile,
      contractDate: new Date(), programDate: date, programEndDate: new Date(+date + 5 * 3600000), executionLocation: "باغ تست",
      typeMetadata: { brideName: "سارا", groomName: "احمد", venue: "باغ تست" },
      items: [{ title: "عکاسی", quantity: 1, unitPrice: 60_000_000 }, { title: "فیلمبرداری", quantity: 1, unitPrice: 30_000_000 }, { title: "پهپاد", quantity: 1, unitPrice: 10_000_000 }],
      discountAmount: 10_000_000,
      paidAmount: 30_000_000, paymentAccountId: accountId,
    });
    expect(contract).toMatchObject({ status: "draft", itemsTotal: 100_000_000, totalAmount: "90000000.00", paidAmount: 30_000_000, remainingAmount: 60_000_000 });
    expect(contract.typeMetadata).toMatchObject({ brideName: "سارا", groomName: "احمد" });
    expect(contract.items).toHaveLength(3);

    const replay = await createPendingContract(actor, { idempotencyKey: contract.idempotencyKey, projectTypeId: typeId, customerName: "تکراری", mobile, programDate: date, items: [{ title: "تکراری", unitPrice: 1 }] });
    expect(replay.id).toBe(contract.id);
    await expect(createPendingContract(actor, {
      idempotencyKey: randomUUID(), projectTypeId: typeId, customerName: "تخفیف نامعتبر", mobile: `0917${Date.now().toString().slice(-7)}`,
      programDate: date, items: [{ title: "آیتم", unitPrice: 1_000_000 }], discountAmount: 1_000_001,
    })).rejects.toThrow("بیشتر از جمع آیتم‌ها");
    expect(await db.select().from(customers).where(eq(customers.mobile, mobile))).toHaveLength(1);
    expect(await db.select().from(studioCustomers).where(eq(studioCustomers.id, contract.customer.studioCustomerId))).toHaveLength(1);
  });

  it("edits pending data without losing payment metadata, then approves idempotently", async () => {
    const updated = await updateContract(actor, contract.id, { customerName: "احمد و سارا ویرایش", mobile: contract.customer.mobile, notes: "ویرایش تست", typeMetadata: { ceremonyNotes: "نور کم" } });
    expect(updated.typeMetadata).toMatchObject({ ceremonyNotes: "نور کم", paymentDraft: { accountId } });
    expect(updated.customer.name).toBe("احمد و سارا ویرایش");
    const approved = await approveContract(actor, contract.id);
    const replay = await approveContract(actor, contract.id);
    expect(approved.status).toBe("signed");
    expect(replay.invoiceId).toBe(approved.invoiceId);
    expect(approved.paidAmount).toBe(30_000_000);
    expect(approved.remainingAmount).toBe(60_000_000);
    expect(approved.discountAmount).toBe("10000000.00");
    expect(await db.select().from(invoices).where(eq(invoices.id, approved.invoiceId!))).toHaveLength(1);
    expect(await db.select().from(studioCalendarEvents).where(eq(studioCalendarEvents.contractId, approved.id))).toHaveLength(1);
    await expect(updateContract(actor, contract.id, { items: [{ title: "تغییر غیرمجاز", unitPrice: 1 }] })).rejects.toThrow("تأییدشده");
    contract = approved;
  });

  it("plans every contract item with wage snapshots and conflict protection", async () => {
    const person = await createStudioPersonnel({ fullName: "عکاس تست نهایی", mobile: `0935${Date.now().toString().slice(-7)}`, personnelType: "temporary_worker", primaryRole: "photographer", status: "active", skills: [{ skillTitle: "عکاسی", skillCategory: "shooting" }] });
    const equipment = await createStudioEquipment({ title: "دوربین تست نهایی", category: "camera", serialNumber: randomUUID(), currentHealthStatus: "healthy", locationType: "in_studio" });
    const [photo, video] = contract.items;
    const startsAt = contract.programDate, endsAt = contract.programEndDate;
    const assignment = await assignPersonnelToItem(actor, photo.id, { personnelId: person.id, startsAt, endsAt, wageAmount: 5_000_000 });
    expect(Number(assignment.wageSnapshot)).toBe(5_000_000);
    const [stored] = await db.select().from(studioPlanningPersonnel).where(eq(studioPlanningPersonnel.id, assignment.id));
    expect(Number(stored.wageSnapshot)).toBe(5_000_000);
    const [wageSource] = await db.select().from(atelierExpenseSources).where(and(eq(atelierExpenseSources.sourceType, "personnel_wage"), eq(atelierExpenseSources.sourceId, stored.salaryRecordId!)));
    const [wageExpense] = await db.select().from(expenses).where(eq(expenses.id, wageSource.expenseId));
    expect(wageExpense).toMatchObject({ paymentStatus: "unpaid", paidAmount: "0.00" });
    expect(Number(wageExpense.amount)).toBe(5_000_000);
    await expect(assignPersonnelToItem(actor, video.id, { personnelId: person.id, startsAt, endsAt, wageAmount: 7_000_000 })).resolves.toBeTruthy();
    const other = await createPendingContract(actor, { idempotencyKey: randomUUID(), projectTypeId: typeId, customerName: "تداخل قرارداد دیگر", mobile: `0918${Date.now().toString().slice(-7)}`, programDate: startsAt, programEndDate: endsAt, items: [{ title: "کار همزمان", quantity: 1, unitPrice: 1_000_000 }] });
    const approvedOther = await approveContract(actor, other.id);
    await expect(assignPersonnelToItem(actor, approvedOther.items[0].id, { personnelId: person.id, startsAt, endsAt, wageAmount: 1_000_000 })).rejects.toThrow("برنامه دیگری");
    const equipmentAssignment = await assignEquipmentToItem(actor, photo.id, { equipmentId: equipment.id, startsAt, endsAt });
    await expect(assignEquipmentToItem(actor, video.id, { equipmentId: equipment.id, startsAt, endsAt })).rejects.toThrow("تداخل زمانی");
    expect(await db.select().from(equipmentReservations).where(eq(equipmentReservations.contractItemId, photo.id))).toHaveLength(1);
    const shorterEnd = new Date(+new Date(endsAt) - 30 * 60_000);
    const editedPerson = await updatePersonnelAssignment(actor, photo.id, assignment.id, { personnelId: person.id, startsAt, endsAt: shorterEnd, wageAmount: 5_500_000 });
    expect(Number(editedPerson.wageSnapshot)).toBe(5_500_000);
    const editedEquipment = await updateEquipmentAssignment(actor, photo.id, equipmentAssignment.id, { equipmentId: equipment.id, startsAt, endsAt: shorterEnd });
    expect(+new Date(editedEquipment.reservedTo)).toBe(+shorterEnd);
    await deleteEquipmentAssignment(actor, photo.id, equipmentAssignment.id);
    await deletePersonnelAssignment(actor, photo.id, assignment.id);
    expect(await db.select().from(studioPlanningPersonnel).where(eq(studioPlanningPersonnel.id, assignment.id))).toHaveLength(0);
    expect(await db.select().from(equipmentReservations).where(eq(equipmentReservations.id, equipmentAssignment.id))).toHaveLength(0);
    expect((await getPlanning(null)).contracts.some((row) => row.id === contract.id)).toBe(true);
  });

  it("edits contract finance, preserves installment allocations, and records auditable balance adjustments", async () => {
    await expect(updateContractFinance(actor, contract.id, { discountAmount: 75_000_000 })).rejects.toThrow("دریافت‌شده");
    const finance = await updateContractFinance(actor, contract.id, { discountAmount: 15_000_000, financialNotes: "اصلاح توافق نهایی" });
    expect(finance).toMatchObject({ finalAmount: 85_000_000, paidAmount: 30_000_000, balanceDue: 55_000_000 });
    const dueSoon = new Date(Date.now() + 2 * 86400000), later = new Date(Date.now() + 20 * 86400000);
    const installments = await saveContractInstallments(actor, contract.id, [{ title: "روز مراسم", amount: 25_000_000, dueDate: dueSoon }, { title: "تحویل فایل", amount: 30_000_000, dueDate: later }]);
    const paymentKey = randomUUID();
    const payment = await payAtelierInstallment(actor, installments[0].id, { amount: 5_000_000, accountId, paidAt: new Date(), paymentMethod: "card_transfer", idempotencyKey: paymentKey });
    const replay = await payAtelierInstallment(actor, installments[0].id, { amount: 5_000_000, accountId, paidAt: new Date(), paymentMethod: "card_transfer", idempotencyKey: paymentKey });
    expect(replay.id).toBe(payment.id);
    expect((await db.select().from(studioInstallmentAllocations).where(eq(studioInstallmentAllocations.installmentId, installments[0].id))).reduce((sum, row) => sum + Number(row.amount), 0)).toBe(5_000_000);
    await expect(payAtelierInstallment(actor, installments[0].id, { amount: 20_000_001, accountId, idempotencyKey: randomUUID() })).rejects.toThrow("مانده قسط");
    const changedDue = new Date(Date.now() + 3 * 86400000);
    await saveContractInstallments(actor, contract.id, [{ id: installments[0].id, title: "روز مراسم", amount: 25_000_000, dueDate: changedDue }, { id: installments[1].id, title: "تحویل فایل", amount: 30_000_000, dueDate: later }]);
    expect(Math.floor(+new Date((await db.select().from(studioInstallments).where(eq(studioInstallments.id, installments[0].id)))[0].dueDate) / 1000)).toBe(Math.floor(+changedDue / 1000));
    const before = Number((await db.select().from(accounts).where(eq(accounts.id, accountId)))[0].balance), target = before + 1_234_567;
    const adjustment = await adjustAtelierAccountBalance(actor, accountId, { newBalance: target, reason: "اصلاح مغایرت موجودی بانک", idempotencyKey: randomUUID() });
    expect(Number(adjustment.delta)).toBe(1_234_567);
    expect(Number((await db.select().from(accounts).where(eq(accounts.id, accountId)))[0].balance)).toBe(target);
    expect(await db.select().from(accountBalanceAdjustments).where(eq(accountBalanceAdjustments.id, adjustment.id))).toHaveLength(1);
    expect((await db.select().from(auditLogs).where(eq(auditLogs.entityId, accountId))).some((row) => row.action === "ATELIER_ACCOUNT_BALANCE_ADJUSTED")).toBe(true);
    const center = await getAtelierFinanceCenter(null);
    expect(center.installments.find((row) => row.id === installments[0].id)).toMatchObject({ paidAmount: 5_000_000, remainingAmount: 20_000_000 });
    expect((await getFinalNotifications(null)).some((row) => row.conditionKey === `installment-due:${installments[0].id}`)).toBe(true);
  });

  it("creates and resolves the critical rented-equipment reminder without deleting history", async () => {
    const drone = contract.items.find((item: any) => item.title === "پهپاد");
    const rental = await addRentalRequirement(actor, drone.id, { itemTitle: "پهپاد حرفه‌ای", supplierName: "اجاره‌دهنده تست", neededAt: contract.programDate, returnAt: contract.programEndDate, estimatedCost: 4_000_000 });
    const [rentalSource] = await db.select().from(atelierExpenseSources).where(and(eq(atelierExpenseSources.sourceType, "rental"), eq(atelierExpenseSources.sourceId, rental.id)));
    expect(Number((await db.select().from(expenses).where(eq(expenses.id, rentalSource.expenseId)))[0].amount)).toBe(4_000_000);
    const before = await getFinalNotifications(null);
    const reminder = before.find((item) => item.conditionKey === `rental:${rental.id}`) as any;
    expect(reminder?.priority).toBe("critical");
    expect(String(reminder?.message)).toContain("پهپاد حرفه‌ای");
    await setNotificationArchived(actor, reminder!.id, true);
    expect((await getFinalNotifications(null)).some((item) => item.id === reminder!.id)).toBe(false);
    expect((await getFinalNotifications(null, true)).some((item) => item.id === reminder!.id)).toBe(true);
    await setNotificationArchived(actor, reminder!.id, false);
    expect((await getFinalNotifications(null)).some((item) => item.id === reminder!.id)).toBe(true);
    await markRentalAsRented(actor, rental.id, 3_500_000);
    const after = await getFinalNotifications(null);
    expect(after.some((item) => item.conditionKey === `rental:${rental.id}`)).toBe(false);
    const [stored] = await db.select().from(rentalEquipment).where(eq(rentalEquipment.id, rental.id));
    expect(stored).toMatchObject({ status: "rented", markedRentedById: actorId });
    expect(Number((await db.select().from(expenses).where(eq(expenses.id, rentalSource.expenseId)))[0].amount)).toBe(3_500_000);
  });

  it("keeps daily visits and reservations lightweight, consistent, and outside formal customers", async () => {
    const visitMobile = `0921${Date.now().toString().slice(-7)}`;
    const reservationMobile = `0990${Date.now().toString().slice(-7)}`;
    const visit = await saveDailyVisit(actor, { title: "عکس پرسنلی", date: new Date(), price: 2_000_000, paidAmount: 500_000, customerName: "مراجعه تست", mobile: visitMobile, accountId });
    expect(visit.remainingAmount).toBe(1_500_000);
    expect((await listDailyVisits()).some((row) => row.id === visit.id)).toBe(true);
    const balanceBefore = Number((await db.select().from(accounts).where(eq(accounts.id, accountId)))[0].balance);
    const secondKey = randomUUID(), secondDate = new Date();
    const second = await recordAtelierReceipt(actor, { sourceType: "daily_visit", sourceId: visit.id, accountId, amount: 750_000, paidAt: secondDate, idempotencyKey: secondKey });
    const replay = await recordAtelierReceipt(actor, { sourceType: "daily_visit", sourceId: visit.id, accountId, amount: 750_000, paidAt: secondDate, idempotencyKey: secondKey });
    expect(replay.id).toBe(second.id);
    await recordAtelierReceipt(actor, { sourceType: "daily_visit", sourceId: visit.id, accountId, amount: 750_000, idempotencyKey: randomUUID() });
    const paidVisit = (await listDailyVisits()).find((row) => row.id === visit.id)!;
    expect(paidVisit).toMatchObject({ paidAmount: 2_000_000, remainingAmount: 0 });
    expect(paidVisit.paymentHistory).toHaveLength(3);
    expect(Number((await db.select().from(accounts).where(eq(accounts.id, accountId)))[0].balance) - balanceBefore).toBe(1_500_000);
    await expect(recordAtelierReceipt(actor, { sourceType: "daily_visit", sourceId: visit.id, accountId, amount: 1, idempotencyKey: randomUUID() })).rejects.toThrow();
    const reservation = await saveReservation(actor, { title: "رزرو پرتره", date: tomorrow(), customerName: "رزرو تست", mobile: reservationMobile });
    expect(reservation.remainingAmount).toBe(0);
    expect(reservation.invoiceId).toBeNull();
    await completeReservation(actor, reservation.id);
    expect((await listReservations()).find((row) => row.id === reservation.id)).toBeUndefined();
    expect(await db.select().from(studioReservations).where(eq(studioReservations.id, reservation.id))).toHaveLength(0);
    const convertible = await saveReservation(actor, { title: "رزرو قابل انتقال", date: tomorrow(), customerName: "انتقال تست", mobile: `0991${Date.now().toString().slice(-7)}` });
    await expect(convertReservationToDailyVisit(actor, convertible.id, { price: 100_000, paidAmount: 100_001, accountId })).rejects.toThrow();
    expect(await db.select().from(studioReservations).where(eq(studioReservations.id, convertible.id))).toHaveLength(1);
    const converted = await convertReservationToDailyVisit(actor, convertible.id, { price: 100_000, paidAmount: 0 });
    expect(converted.title).toBe("رزرو قابل انتقال");
    expect(await db.select().from(studioReservations).where(eq(studioReservations.id, convertible.id))).toHaveLength(0);
    expect((await convertReservationToDailyVisit(actor, convertible.id, { price: 100_000, paidAmount: 0 })).id).toBe(converted.id);
    const simpleCustomers = await db.select().from(customers).where(sql`${customers.mobile} IN (${visitMobile},${reservationMobile})`);
    expect(simpleCustomers).toHaveLength(1);
    expect(await db.select().from(studioCustomers).where(inArray(studioCustomers.customerId, simpleCustomers.map((row) => row.id)))).toHaveLength(0);
  });

  it("shows only contract customers and counts approved contracts on the Jalali calendar", async () => {
    const clients = await listContractCustomers(null);
    expect(clients.some((client) => client.id === contract.customer.studioCustomerId && client.contractCount >= 1)).toBe(true);
    const calendar = await getFinalCalendar(null);
    const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(contract.programDate));
    expect(calendar.days.find((day) => day.date === dateKey)?.contracts.some((row) => row.id === contract.id)).toBe(true);
    expect(calendar.thresholds).toMatchObject({ light: 1, medium: 2, heavy: 3 });
  });

  it("keeps the exact Persian menu order and one responsive left-side navigation", () => {
    const layout = readFileSync(new URL("../src/components/layout/AppLayout.tsx", import.meta.url), "utf8");
    const expected = ["داشبورد", "قرارداد", "مراجعات روزانه", "رزرو", "برنامه ریزی", "تقویم", "مشتریان", "پرسنل", "تجهیزات", "مالی", "اعلانات", "دستیار هوش مصنوعی", "تنظیمات"];
    const indexes = expected.map((label) => layout.indexOf(`label: "${label}"`));
    expect(indexes.every((index) => index >= 0)).toBe(true);
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
    expect((layout.match(/const NAVIGATION/g) || [])).toHaveLength(1);
    expect(layout).toContain("fixed bottom-0 left-0 top-0");
    expect(layout).toContain("-translate-x-full");
    expect(layout).toContain("lg:ml-[17rem]");
    for (const forbidden of ["سرنخ‌ها و CRM", "Workboard", "Project 360", "مواد اولیه", "BOM", "تولید", "انبار", "سفارشات"]) expect(layout).not.toContain(forbidden);
  });

  it("uses shared name-based financial controls and a portal calendar", () => {
    const finance = readFileSync(new URL("../src/components/atelier/AtelierFinanceView.tsx", import.meta.url), "utf8");
    const controls = readFileSync(new URL("../src/components/atelier/FinanceControls.tsx", import.meta.url), "utf8");
    const calendar = readFileSync(new URL("../src/components/ui/JalaliDatePicker.tsx", import.meta.url), "utf8");
    const reservations = readFileSync(new URL("../src/components/atelier/SimpleRecordsView.tsx", import.meta.url), "utf8");
    expect(finance).toContain('"اقساط"');
    expect(finance).not.toContain("شناسه حساب");
    expect(controls).toContain("موجودی");
    expect(calendar).toContain("createPortal");
    expect((reservations.match(/لغو و حذف رزرو|تکمیل شده و حذف/g) || [])).toHaveLength(0);
  });
});
