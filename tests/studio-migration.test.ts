import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../src/db";
import { migrateDatabase } from "../src/db/migrate";
import {
  customers,
  employees,
  projects,
  studioCustomers,
  studioProjects,
  studioContracts,
  studioPersonnel,
  personnelSkills,
  personnelSalaryRecords,
  studioEquipment,
  equipmentReservations,
  rentalEquipment,
  studioProductionPlans,
  studioProductionSteps,
  studioCalendarEvents,
  studioTasks,
  studioNotifications,
  permissions,
  roles,
  rolePermissions,
  codeSequences,
} from "../src/db/schema";
import { eq, and, sql } from "drizzle-orm";

describe("Hekmat Atelier (حکمت آتلیه) Database Migration & Schema Verification", () => {
  beforeAll(async () => {
    // Run migration
    await migrateDatabase();
  });

  it("should be idempotent and succeed when running migrateDatabase again", async () => {
    await expect(migrateDatabase()).resolves.not.toThrow();
  });

  it("should have seeded the studio code sequences and permissions", async () => {
    const seqs = await db.select().from(codeSequences);
    const seqIds = seqs.map((s) => s.id);
    expect(seqIds).toContain("studio_project");
    expect(seqIds).toContain("studio_contract");
    expect(seqIds).toContain("studio_equipment");

    const perms = await db.select().from(permissions);
    const permCodes = perms.map((p) => p.code);
    expect(permCodes).toContain("studio.view");
    expect(permCodes).toContain("studio.projects.manage");
    expect(permCodes).toContain("studio.contracts.create");
    expect(permCodes).toContain("studio.personnel.manage");
    expect(permCodes).toContain("studio.equipment.manage");
    expect(permCodes).toContain("studio.equipment.reserve");
    expect(permCodes).toContain("studio.production.manage");
    expect(permCodes).toContain("studio.calendar.view");
    expect(permCodes).toContain("studio.notifications.send");
    expect(permCodes).toEqual(expect.arrayContaining([
      "studio.contract.view", "studio.contract.manage", "studio.finance.view", "studio.finance.manage",
      "studio.personnel.wage.view", "studio.personnel.wage.manage", "studio.profitability.view",
      "backup.download", "backup.verify", "backup.restore", "backup.delete",
    ]));
  });

  it("restricts backup creation and restore capabilities to administrators", async () => {
    const rows = await db.select({ role: roles.code, permission: permissions.code }).from(rolePermissions).innerJoin(roles, eq(rolePermissions.roleId, roles.id)).innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id)).where(sql`${permissions.code} IN ('backup.create','backup.download','backup.verify','backup.restore','backup.delete')`);
    expect(rows.some((row) => row.role !== "admin")).toBe(false);
    expect(rows.filter((row) => row.role === "admin").map((row) => row.permission)).toEqual(expect.arrayContaining(["backup.create", "backup.download", "backup.verify", "backup.restore", "backup.delete"]));
  });

  it("records every versioned migration through Atelier productization", async () => {
    const rows = await db.select({ id: sql<string>`id` }).from(sql`app_migrations`).orderBy(sql`id`);
    expect(rows.map((row: any) => row.id)).toEqual([
      "001_studio_financial_links",
      "002_studio_reconciliation_indexes",
      "003_studio_authorization_audit",
      "004_studio_constraints_indexes",
      "005_backup_recovery",
      "006_atelier_product",
      "007_atelier_final_workflow",
    ]);
  });

  it("enforces new date and amount invariants for new records", async () => {
    const [equipment] = await db.insert(studioEquipment).values({ code: `INV-${Date.now()}`, title: "Constraint Camera", category: "camera" }).returning();
    await expect(db.insert(equipmentReservations).values({ equipmentId: equipment.id, reservedFrom: new Date("2027-01-02T10:00:00Z"), reservedTo: new Date("2027-01-02T09:00:00Z") })).rejects.toThrow();
  });

  it("should support full lifecycle insertion across all 13 studio tables", async () => {
    // 1. Create a customer & studio customer
    const [baseCustomer] = await db
      .insert(customers)
      .values({
        code: `CUST-ATELIER-${Date.now()}`,
        name: "آقای علیرضا رضایی و خانم مریم صادقی",
        mobile: "09120000001",
      })
      .returning();

    const [studioCust] = await db
      .insert(studioCustomers)
      .values({
        customerId: baseCustomer.id,
        customerType: "wedding",
        groomName: "علیرضا رضایی",
        brideName: "مریم صادقی",
        contactPersonRole: "عروس",
        specialPreferences: "موزیک ملایم، رنگ گرم، ادیت سینمایی",
        socialConsent: true,
        vipLevel: "gold",
      })
      .returning();

    expect(studioCust.id).toBeDefined();
    expect(studioCust.groomName).toBe("علیرضا رضایی");

    // 2. Create studio project
    const projectNum = `STU-TEST-${Date.now()}`;
    const [studioProj] = await db
      .insert(studioProjects)
      .values({
        projectNumber: projectNum,
        studioCustomerId: studioCust.id,
        title: "پروژه فرمالیته و عروسی رضایی",
        eventType: "wedding",
        packageType: "diamond",
        eventDate: new Date("2026-10-15T09:00:00Z"),
        mainLocation: "عمارت دانیال گرمدره",
        status: "booked",
        totalContractValue: "85000000",
        shootingBrief: "شوتینگ باغ از ساعت ۱۰ صبح، هلی‌شات ورود و مراسم سالن",
      })
      .returning();

    expect(studioProj.id).toBeDefined();
    expect(studioProj.projectNumber).toBe(projectNum);

    // 3. Create studio contract
    const contractNum = `CTR-TEST-${Date.now()}`;
    const [studioCont] = await db
      .insert(studioContracts)
      .values({
        contractNumber: contractNum,
        studioProjectId: studioProj.id,
        totalAmount: "85000000",
        depositAmount: "25000000",
        installmentsCount: 3,
        contractDate: new Date(),
        deliveryCommitmentDate: new Date("2026-11-20T18:00:00Z"),
        termsAndConditions: "تحویل راش‌ها پس از تسویه قسط دوم و آلبوم دیجیتال ۶۰ روزه",
        status: "signed",
      })
      .returning();

    expect(studioCont.id).toBeDefined();
    expect(studioCont.contractNumber).toBe(contractNum);

    // 4. Create studio personnel: both employee and temporary_worker
    const [empPersonnel] = await db
      .insert(studioPersonnel)
      .values({
        personnelType: "employee",
        fullName: "محمد کاظمی",
        mobile: "09121111111",
        primaryRole: "photographer",
        experienceYears: 7,
        rating: "4.90",
        status: "active",
      })
      .returning();

    const [tempPersonnel] = await db
      .insert(studioPersonnel)
      .values({
        personnelType: "temporary_worker",
        fullName: "احسان مرادی (کرین‌کار آزاد)",
        mobile: "09122222222",
        primaryRole: "crane_operator",
        experienceYears: 4,
        rating: "4.75",
        status: "active",
      })
      .returning();

    expect(empPersonnel.personnelType).toBe("employee");
    expect(tempPersonnel.personnelType).toBe("temporary_worker");

    // 5. Create skills
    const [skill1] = await db
      .insert(personnelSkills)
      .values({
        personnelId: empPersonnel.id,
        skillTitle: "عکاسی پرتره و فرمالیته سونی",
        skillCategory: "shooting",
        proficiencyLevel: "master",
        certified: true,
      })
      .returning();

    expect(skill1.id).toBeDefined();

    // 6. Create salary records (دستمزد آفیش)
    const [salary1] = await db
      .insert(personnelSalaryRecords)
      .values({
        personnelId: empPersonnel.id,
        studioProjectId: studioProj.id,
        salaryType: "per_project",
        rateAmount: "5000000",
        unitsCount: "1",
        totalCalculated: "5000000",
        paymentStatus: "pending",
        notes: "آفیش کل روز عمارت",
      })
      .returning();

    expect(salary1.totalCalculated).toBe("5000000.00");

    // 7. Create studio equipment
    const equipCode = `EQ-CAM-${Date.now()}`;
    const [camera] = await db
      .insert(studioEquipment)
      .values({
        code: equipCode,
        title: "Sony FX3 Cinema Line",
        category: "camera",
        brand: "Sony",
        model: "FX3",
        currentHealthStatus: "healthy",
        locationType: "in_studio",
      })
      .returning();

    expect(camera.code).toBe(equipCode);

    // 8. Create equipment reservation
    const [reservation] = await db
      .insert(equipmentReservations)
      .values({
        equipmentId: camera.id,
        studioProjectId: studioProj.id,
        assignedPersonnelId: empPersonnel.id,
        reservedFrom: new Date("2026-10-15T08:00:00Z"),
        reservedTo: new Date("2026-10-15T22:00:00Z"),
        status: "reserved",
        notes: "پکیج باتری دوبل و لنز 24-70",
      })
      .returning();

    expect(reservation.id).toBeDefined();

    // 9. Create rental equipment
    const [rental] = await db
      .insert(rentalEquipment)
      .values({
        studioProjectId: studioProj.id,
        itemTitle: "لنز سونی 70-200 GM II",
        rentalCompany: "رنتال نگاه برتر",
        rentalCost: "1800000",
        pickupDate: new Date("2026-10-14T17:00:00Z"),
        returnDate: new Date("2026-10-16T11:00:00Z"),
        status: "planned",
      })
      .returning();

    expect(rental.rentalCost).toBe("1800000.00");

    // 10. Create production plan and steps
    const [prodPlan] = await db
      .insert(studioProductionPlans)
      .values({
        studioProjectId: studioProj.id,
        targetDeliveryDate: new Date("2026-11-20T00:00:00Z"),
        currentStage: "raw_backup",
        albumSpecs: { size: "40x80", pages: 24, paperType: "metallic" },
        storageFolderLink: "/nas/archive/2026/rezaei_wedding",
      })
      .returning();

    expect(prodPlan.id).toBeDefined();

    const [step1] = await db
      .insert(studioProductionSteps)
      .values({
        planId: prodPlan.id,
        stepName: "بکاپ و مرتب‌سازی راش‌های 4K",
        assignedPersonnelId: empPersonnel.id,
        deadline: new Date("2026-10-16T18:00:00Z"),
        status: "in_progress",
      })
      .returning();

    expect(step1.stepName).toBe("بکاپ و مرتب‌سازی راش‌های 4K");

    // 11. Create calendar event
    const [calEvent] = await db
      .insert(studioCalendarEvents)
      .values({
        studioProjectId: studioProj.id,
        title: "شوتینگ اصلی فرمالیته و عمارت رضایی",
        eventType: "shooting",
        startTime: new Date("2026-10-15T09:00:00Z"),
        endTime: new Date("2026-10-15T21:00:00Z"),
        location: "عمارت دانیال گرمدره",
        assignedPersonnelIds: [empPersonnel.id, tempPersonnel.id],
        status: "confirmed",
      })
      .returning();

    expect(calEvent.title).toContain("رضایی");

    // 12. Create studio task
    const [taskItem] = await db
      .insert(studioTasks)
      .values({
        studioProjectId: studioProj.id,
        assignedPersonnelId: empPersonnel.id,
        title: "چک کردن رم‌ها و فرمت کارت‌های CFexpress",
        stage: "pre_production",
        priority: "high",
        status: "open",
        dueDate: new Date("2026-10-14T20:00:00Z"),
      })
      .returning();

    expect(taskItem.stage).toBe("pre_production");

    // 13. Create studio notification
    const [notif] = await db
      .insert(studioNotifications)
      .values({
        studioProjectId: studioProj.id,
        recipientType: "customer",
        recipientName: "آقای علیرضا رضایی",
        recipientMobile: "09120000001",
        notificationType: "shoot_reminder",
        messageText: "سلام آقای رضایی، یادآوری آفیش شوتینگ فردا ساعت ۹ صبح در عمارت دانیال.",
        scheduledFor: new Date("2026-10-14T10:00:00Z"),
        status: "pending",
      })
      .returning();

    expect(notif.notificationType).toBe("shoot_reminder");
  });
});
