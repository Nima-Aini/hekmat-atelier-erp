import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../src/db";
import { migrateDatabase } from "../src/db/migrate";
import {
  createStudioPersonnel,
  listStudioPersonnel,
  getStudioPersonnelById,
  updateStudioPersonnel,
  addPersonnelSkill,
  recordPersonnelSalary,
  getPersonnelSchedule,
  deleteStudioPersonnel,
} from "../src/services/studio/personnelService";
import {
  createStudioEquipment,
  listStudioEquipment,
  getStudioEquipmentById,
  updateStudioEquipment,
  reserveStudioEquipment,
  updateReservationStatus,
  deleteOrRetireEquipment,
} from "../src/services/studio/equipmentService";
import {
  createStudioCustomer,
  listStudioCustomers,
  getStudioCustomerById,
  updateStudioCustomer,
  deleteStudioCustomer,
} from "../src/services/studio/customerService";
import {
  createStudioProject,
  listStudioProjects,
  getStudioProjectById,
  updateStudioProjectStatus,
  createStudioContract,
  assignPersonnelToProject,
  reserveEquipmentForProject,
  addRentalToProject,
} from "../src/services/studio/projectService";

describe("Hekmat Atelier (حکمت آتلیه) - Backend Services & Workflows", () => {
  beforeAll(async () => {
    // Ensure migrations and tables are ready
    await migrateDatabase();
  });

  describe("1. Personnel Module", () => {
    let personnelId: string;

    it("should create studio personnel with skills", async () => {
      const uniqueMobile = `0912${Date.now().toString().slice(-7)}`;
      const p = await createStudioPersonnel({
        fullName: "علی رضایی (فیلمبردار ارشد)",
        mobile: uniqueMobile,
        primaryRole: "videographer",
        personnelType: "temporary_worker",
        experienceYears: 6,
        rating: 4.8,
        notes: "متخصص تصویربرداری سینمایی و کار با رونین",
        skills: [
          {
            skillTitle: "تصویربرداری هوایی هلی‌شات",
            skillCategory: "aerial",
            proficiencyLevel: "master",
            certified: true,
          },
        ],
      });

      expect(p).toBeDefined();
      expect(p.id).toBeDefined();
      expect(p.fullName).toBe("علی رضایی (فیلمبردار ارشد)");
      expect(p.primaryRole).toBe("videographer");
      personnelId = p.id;
    });

    it("should list personnel and find the created personnel", async () => {
      const list = await listStudioPersonnel({
        primaryRole: "videographer",
        page: 1,
        pageSize: 10,
      });

      expect(list.personnel.length).toBeGreaterThan(0);
      const found = list.personnel.find((item) => item.id === personnelId);
      expect(found).toBeDefined();
      expect(found?.skills.length).toBeGreaterThan(0);
    });

    it("should get personnel details by ID", async () => {
      const p = await getStudioPersonnelById(personnelId);
      expect(p.id).toBe(personnelId);
      expect(p.skills.length).toBe(1);
      expect(p.skills[0].skillTitle).toBe("تصویربرداری هوایی هلی‌شات");
    });

    it("should prevent duplicate skill registration for the same personnel", async () => {
      await expect(
        addPersonnelSkill(personnelId, {
          skillTitle: "تصویربرداری هوایی هلی‌شات",
          skillCategory: "aerial",
        })
      ).rejects.toThrow("این مهارت قبلاً برای این شخص ثبت شده است.");
    });

    it("should add a new unique skill", async () => {
      const skill = await addPersonnelSkill(personnelId, {
        skillTitle: "کار با گیمبال Ronin 4D",
        skillCategory: "shooting",
        proficiencyLevel: "senior",
      });
      expect(skill.skillTitle).toBe("کار با گیمبال Ronin 4D");
    });

    it("should calculate salary record on backend without client financial decisions", async () => {
      const salary = await recordPersonnelSalary({
        personnelId,
        salaryType: "per_hour",
        rateAmount: 500000,
        unitsCount: 8,
        notes: "۸ ساعت تصویربرداری فرمالیته شمال",
      });

      expect(salary.rateAmount).toBe("500000.00");
      expect(salary.unitsCount).toBe("8.00");
      expect(salary.totalCalculated).toBe("4000000.00"); // 500,000 * 8 = 4,000,000
    });

    it("should retrieve personnel schedule", async () => {
      const schedule = await getPersonnelSchedule(personnelId);
      expect(schedule).toBeDefined();
      expect(Array.isArray(schedule.events)).toBe(true);
      expect(Array.isArray(schedule.reservations)).toBe(true);
    });

    it("should soft-archive personnel when historical financial records exist", async () => {
      const result = await deleteStudioPersonnel(personnelId);
      expect(result.success).toBe(true);
      expect(result.archived).toBe(true);

      const p = await getStudioPersonnelById(personnelId);
      expect(p.status).toBe("inactive");
    });
  });

  describe("2. Equipment Module & Conflict Prevention", () => {
    let equipmentId: string;

    it("should register studio equipment with sequential code", async () => {
      const eq = await createStudioEquipment({
        title: "Sony FX3 Full-Frame Cinema Camera",
        category: "camera",
        brand: "Sony",
        model: "ILME-FX3",
        serialNumber: `SN-FX3-${Date.now().toString().slice(-4)}`,
        purchaseCost: 220000000,
        currentHealthStatus: "healthy",
        requiresInsurance: true,
        locationType: "in_studio",
      });

      expect(eq).toBeDefined();
      expect(eq.id).toBeDefined();
      expect(eq.code).toMatch(/^EQ-/);
      expect(eq.currentHealthStatus).toBe("healthy");
      equipmentId = eq.id;
    });

    it("should list equipment and filter by category", async () => {
      const list = await listStudioEquipment({
        category: "camera",
      });
      expect(list.equipment.length).toBeGreaterThan(0);
      const found = list.equipment.find((e) => e.id === equipmentId);
      expect(found).toBeDefined();
    });

    it("should reserve equipment successfully for interval [T1, T2]", async () => {
      const now = Date.now();
      const from = new Date(now + 24 * 60 * 60 * 1000); // Tomorrow
      const to = new Date(now + 30 * 60 * 60 * 1000); // Tomorrow + 6 hours

      const res = await reserveStudioEquipment({
        equipmentId,
        reservedFrom: from,
        reservedTo: to,
        notes: "پروژه عکاسی باغ تالار",
      });

      expect(res.id).toBeDefined();
      expect(res.status).toBe("reserved");
    });

    it("should PREVENT duplicate overlapping reservation and throw Conflict (409)", async () => {
      const now = Date.now();
      // Overlapping by 2 hours into the existing reservation
      const conflictingFrom = new Date(now + 26 * 60 * 60 * 1000);
      const conflictingTo = new Date(now + 32 * 60 * 60 * 1000);

      await expect(
        reserveStudioEquipment({
          equipmentId,
          reservedFrom: conflictingFrom,
          reservedTo: conflictingTo,
          notes: "تداخل در رزرو",
        })
      ).rejects.toThrow("تداخل زمانی!");
    });

    it("should update reservation status to checkout and checkin", async () => {
      const reservations = (await getStudioEquipmentById(equipmentId)).reservations;
      const firstRes = reservations[0];
      expect(firstRes).toBeDefined();

      const checkedOut = await updateReservationStatus(firstRes.id, "checkout");
      expect(checkedOut.status).toBe("checked_out");
      expect(checkedOut.checkoutTime).toBeDefined();

      const returned = await updateReservationStatus(firstRes.id, "checkin");
      expect(returned.status).toBe("returned");
      expect(returned.checkinTime).toBeDefined();
    });

    it("should retire equipment logically when reservations exist", async () => {
      const result = await deleteOrRetireEquipment(equipmentId);
      expect(result.success).toBe(true);
      expect(result.archived).toBe(true);

      const eq = await getStudioEquipmentById(equipmentId);
      expect(eq.currentHealthStatus).toBe("retired");
    });
  });

  describe("3. Customers Module", () => {
    let customerId: string;

    it("should create studio customer with wedding specific fields", async () => {
      const uniqueMobile = `0935${Date.now().toString().slice(-7)}`;
      const c = await createStudioCustomer({
        name: "امیرحسین راد و سارا محمدی",
        mobile: uniqueMobile,
        phone: "02188776655",
        customerType: "wedding",
        groomName: "امیرحسین راد",
        brideName: "سارا محمدی",
        contactPersonRole: "groom",
        vipLevel: "gold",
        socialConsent: true,
        specialPreferences: { theme: "minimalist_outdoor", printAlbumSize: "40x60" },
      });

      expect(c).toBeDefined();
      expect(c.id).toBeDefined();
      expect(c.groomName).toBe("امیرحسین راد");
      expect(c.brideName).toBe("سارا محمدی");
      expect(c.vipLevel).toBe("gold");
      customerId = c.id;
    });

    it("should list studio customers and support search", async () => {
      const list = await listStudioCustomers({
        search: "امیرحسین",
        customerType: "wedding",
      });

      expect(list.customers.length).toBeGreaterThan(0);
      const found = list.customers.find((c) => c.id === customerId);
      expect(found).toBeDefined();
    });

    it("should update studio customer details", async () => {
      const updated = await updateStudioCustomer(customerId, {
        vipLevel: "platinum",
        notes: "نیاز به هلی‌شات در لوکیشن فرمالیته گرمسار",
      });

      expect(updated.vipLevel).toBe("platinum");
    });

    it("should get customer by ID with full details", async () => {
      const c = await getStudioCustomerById(customerId);
      expect(c.id).toBe(customerId);
      expect(c.vipLevel).toBe("platinum");
      expect(Array.isArray(c.projects)).toBe(true);
    });
  });

  describe("4. Projects & Financial Orchestration", () => {
    let customerId: string;
    let projectId: string;
    let testPersonnelId: string;
    let testEquipId: string;

    beforeAll(async () => {
      const mobile = `0919${Date.now().toString().slice(-7)}`;
      const c = await createStudioCustomer({
        name: "خانواده سرمدی",
        mobile,
        customerType: "wedding",
        groomName: "بهرام سرمدی",
        brideName: "مهسا یوسفی",
      });
      customerId = c.id;

      const pMobile = `0936${Date.now().toString().slice(-7)}`;
      const p = await createStudioPersonnel({
        fullName: "نیلوفر شریفی (عکاس)",
        mobile: pMobile,
        primaryRole: "photographer",
      });
      testPersonnelId = p.id;

      const eq = await createStudioEquipment({
        title: "Canon RF 50mm f/1.2L USM",
        category: "lens",
      });
      testEquipId = eq.id;
    });

    it("should create studio project and initialize standard production workflow", async () => {
      const project = await createStudioProject({
        studioCustomerId: customerId,
        title: "عروسی بهرام و مهسا - عمارت دانیال",
        eventType: "wedding",
        packageType: "Royal Diamond Package",
        eventDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        shootingBrief: "فیلمبرداری ۳ دوربینه به همراه کرین و هلی‌شات",
        mainLocation: "باغ عمارت دانیال گرمدره",
      });

      expect(project).toBeDefined();
      expect(project.id).toBeDefined();
      expect(project.projectNumber).toMatch(/^STU-/);
      expect(project.status).toBe("lead");
      projectId = project.id;
    });

    it("should transition project status correctly", async () => {
      const updated = await updateStudioProjectStatus(projectId, "booked");
      expect(updated.status).toBe("booked");
    });

    it("should issue studio contract with backend financial verification", async () => {
      const contract = await createStudioContract(projectId, {
        totalAmount: 120000000, // 120 million tomans
        depositAmount: 40000000, // 40 million tomans deposit
        installmentsCount: 3,
        termsAndConditions: "تحویل فیلم خام و آلبوم ۴۰ روز کاری پس از انتخاب شات‌ها",
      });

      expect(contract.id).toBeDefined();
      expect(contract.contractNumber).toMatch(/^CTR-/);
      expect(contract.totalAmount).toBe("120000000.00");
      expect(contract.depositAmount).toBe("40000000.00");
      expect(contract.remainingBalance).toBe("80000000.00"); // 120M - 40M = 80M
    });

    it("should reject contract if deposit exceeds total amount", async () => {
      await expect(
        createStudioContract(projectId, {
          totalAmount: 50000000,
          depositAmount: 60000000,
        })
      ).rejects.toThrow("مبلغ بیعانه نمی‌تواند از مبلغ کل قرارداد بیشتر باشد.");
    });

    it("should assign personnel to project and compute salary", async () => {
      const assignment = await assignPersonnelToProject(projectId, {
        personnelId: testPersonnelId,
        salaryType: "per_project",
        rateAmount: 12000000,
        unitsCount: 1,
        notes: "عکاسی کل روز عروسی و باغ",
      });

      expect(assignment.totalCalculated).toBe("12000000.00");
      expect(assignment.paymentStatus).toBe("pending");
    });

    it("should reserve equipment for the project with conflict checking", async () => {
      const res = await reserveEquipmentForProject(projectId, {
        equipmentId: testEquipId,
        assignedPersonnelId: testPersonnelId,
        reservedFrom: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        reservedTo: new Date(Date.now() + 16 * 24 * 60 * 60 * 1000),
      });

      expect(res.id).toBeDefined();
      expect(res.studioProjectId).toBe(projectId);
    });

    it("should add rental equipment with expense tracking to project", async () => {
      const rental = await addRentalToProject(projectId, {
        itemTitle: "کرین ۱۲ متری فیلمبرداری به همراه اپراتور",
        rentalCompany: "تجهیزات سینمایی رهنما",
        rentalCost: 18000000,
        depositGuarantee: 50000000,
        pickupDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        returnDate: new Date(Date.now() + 16 * 24 * 60 * 60 * 1000),
      });

      expect(rental.id).toBeDefined();
      expect(rental.rentalCost).toBe("18000000.00");
    });

    it("should load project 360 view with automated backend financial balance", async () => {
      const project360 = await getStudioProjectById(projectId);

      expect(project360.id).toBe(projectId);
      expect(project360.contracts.length).toBe(1);
      expect(project360.assignedPersonnel.length).toBe(1);
      expect(project360.reservations.length).toBe(1);
      expect(project360.rentals.length).toBe(1);

      // Verify production workflow was initialized
      expect(project360.productionPlan).toBeDefined();
      expect(project360.productionPlan?.steps.length).toBe(6);

      // Verify backend financial computations
      const fin = project360.financialSummary;
      expect(fin.contractTotal).toBe(120000000);
      expect(fin.totalPaymentsReceived).toBe(40000000);
      expect(fin.remainingBalance).toBe(80000000);
      expect(fin.personnelCostTotal).toBe(12000000);
      expect(fin.rentalCostTotal).toBe(18000000);
      expect(fin.totalCost).toBe(30000000); // 12M + 18M = 30M
      expect(fin.grossProfit).toBe(90000000); // 120M - 30M = 90M
      expect(fin.marginPercent).toBe("75.0%"); // 90 / 120 * 100 = 75%
    });
  });
});
