import { db } from "@/db";
import {
  studioPersonnel,
  personnelSkills,
  personnelSalaryRecords,
  studioCalendarEvents,
  equipmentReservations,
  studioTasks,
  studioProjects,
  employees,
} from "@/db/schema";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { ApiError, assertUuid, decimal, pageNumber } from "@/lib/apiError";

export interface CreatePersonnelInput {
  employeeId?: string | null;
  personnelType?: "employee" | "temporary_worker";
  fullName: string;
  mobile: string;
  primaryRole: string;
  portfolioUrl?: string | null;
  experienceYears?: number;
  rating?: number;
  status?: "active" | "on_leave" | "inactive";
  notes?: string | null;
  skills?: Array<{
    skillTitle: string;
    skillCategory: string;
    proficiencyLevel?: "junior" | "mid" | "senior" | "master";
    certified?: boolean;
    notes?: string;
  }>;
}

export interface UpdatePersonnelInput {
  employeeId?: string | null;
  personnelType?: "employee" | "temporary_worker";
  fullName?: string;
  mobile?: string;
  primaryRole?: string;
  portfolioUrl?: string | null;
  experienceYears?: number;
  rating?: number;
  status?: "active" | "on_leave" | "inactive";
  notes?: string | null;
}

export interface ListPersonnelFilter {
  search?: string;
  primaryRole?: string;
  personnelType?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export const VALID_PRIMARY_ROLES = [
  "photographer",
  "videographer",
  "drone_operator",
  "crane_operator",
  "editor",
  "retoucher",
  "director",
  "lighting_tech",
  "sound_engineer",
  "assistant",
  "other",
] as const;

export const VALID_SKILL_CATEGORIES = [
  "shooting",
  "directing",
  "editing",
  "retouch",
  "aerial",
  "lighting",
  "sound",
  "general",
] as const;

export async function listStudioPersonnel(filter: ListPersonnelFilter) {
  const page = pageNumber(filter.page ? String(filter.page) : null, 1);
  const pageSize = pageNumber(filter.pageSize ? String(filter.pageSize) : null, 20, 100);
  const offset = (page - 1) * pageSize;

  const conditions = [];

  if (filter.status && filter.status !== "all") {
    conditions.push(eq(studioPersonnel.status, filter.status));
  }

  if (filter.personnelType && filter.personnelType !== "all") {
    conditions.push(eq(studioPersonnel.personnelType, filter.personnelType));
  }

  if (filter.primaryRole && filter.primaryRole !== "all") {
    conditions.push(eq(studioPersonnel.primaryRole, filter.primaryRole));
  }

  if (filter.search && filter.search.trim()) {
    const searchPattern = `%${filter.search.trim()}%`;
    conditions.push(
      or(
        ilike(studioPersonnel.fullName, searchPattern),
        ilike(studioPersonnel.mobile, searchPattern),
        ilike(studioPersonnel.primaryRole, searchPattern),
        ilike(studioPersonnel.notes, searchPattern)
      )!
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(studioPersonnel)
    .where(whereClause);

  const total = countResult?.total || 0;

  const list = await db
    .select({
      id: studioPersonnel.id,
      employeeId: studioPersonnel.employeeId,
      personnelType: studioPersonnel.personnelType,
      fullName: studioPersonnel.fullName,
      mobile: studioPersonnel.mobile,
      primaryRole: studioPersonnel.primaryRole,
      portfolioUrl: studioPersonnel.portfolioUrl,
      experienceYears: studioPersonnel.experienceYears,
      rating: studioPersonnel.rating,
      status: studioPersonnel.status,
      notes: studioPersonnel.notes,
      createdAt: studioPersonnel.createdAt,
      updatedAt: studioPersonnel.updatedAt,
      employeeName: employees.name,
    })
    .from(studioPersonnel)
    .leftJoin(employees, eq(studioPersonnel.employeeId, employees.id))
    .where(whereClause)
    .orderBy(desc(studioPersonnel.createdAt))
    .limit(pageSize)
    .offset(offset);

  // Fetch skills summary for the loaded personnel
  const personnelIds = list.map((p) => p.id);
  const skillsMap: Record<string, any[]> = {};

  if (personnelIds.length > 0) {
    const allSkills = await db
      .select()
      .from(personnelSkills)
      .where(sql`${personnelSkills.personnelId} IN ${personnelIds}`);

    for (const skill of allSkills) {
      if (!skillsMap[skill.personnelId]) {
        skillsMap[skill.personnelId] = [];
      }
      skillsMap[skill.personnelId].push(skill);
    }
  }

  const formatted = list.map((p) => ({
    ...p,
    rating: Number(p.rating || 5),
    skills: skillsMap[p.id] || [],
  }));

  return {
    personnel: formatted,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

export async function getStudioPersonnelById(id: string) {
  assertUuid(id);

  const [personnel] = await db
    .select({
      id: studioPersonnel.id,
      employeeId: studioPersonnel.employeeId,
      personnelType: studioPersonnel.personnelType,
      fullName: studioPersonnel.fullName,
      mobile: studioPersonnel.mobile,
      primaryRole: studioPersonnel.primaryRole,
      portfolioUrl: studioPersonnel.portfolioUrl,
      experienceYears: studioPersonnel.experienceYears,
      rating: studioPersonnel.rating,
      status: studioPersonnel.status,
      notes: studioPersonnel.notes,
      createdAt: studioPersonnel.createdAt,
      updatedAt: studioPersonnel.updatedAt,
      employeeName: employees.name,
    })
    .from(studioPersonnel)
    .leftJoin(employees, eq(studioPersonnel.employeeId, employees.id))
    .where(eq(studioPersonnel.id, id))
    .limit(1);

  if (!personnel) {
    throw new ApiError(404, "پرسنل یا عوامل موردنظر یافت نشد.");
  }

  // Skills
  const skills = await db
    .select()
    .from(personnelSkills)
    .where(eq(personnelSkills.personnelId, id))
    .orderBy(desc(personnelSkills.createdAt));

  // Recent salary records with project info
  const salaryRecords = await db
    .select({
      id: personnelSalaryRecords.id,
      studioProjectId: personnelSalaryRecords.studioProjectId,
      salaryType: personnelSalaryRecords.salaryType,
      rateAmount: personnelSalaryRecords.rateAmount,
      unitsCount: personnelSalaryRecords.unitsCount,
      totalCalculated: personnelSalaryRecords.totalCalculated,
      paymentStatus: personnelSalaryRecords.paymentStatus,
      paymentId: personnelSalaryRecords.paymentId,
      settlementDate: personnelSalaryRecords.settlementDate,
      notes: personnelSalaryRecords.notes,
      createdAt: personnelSalaryRecords.createdAt,
      projectTitle: studioProjects.title,
      projectNumber: studioProjects.projectNumber,
    })
    .from(personnelSalaryRecords)
    .leftJoin(studioProjects, eq(personnelSalaryRecords.studioProjectId, studioProjects.id))
    .where(eq(personnelSalaryRecords.personnelId, id))
    .orderBy(desc(personnelSalaryRecords.createdAt))
    .limit(20);

  // Recent reservations assigned to this personnel
  const reservations = await db
    .select({
      id: equipmentReservations.id,
      equipmentId: equipmentReservations.equipmentId,
      studioProjectId: equipmentReservations.studioProjectId,
      reservedFrom: equipmentReservations.reservedFrom,
      reservedTo: equipmentReservations.reservedTo,
      status: equipmentReservations.status,
      checkoutTime: equipmentReservations.checkoutTime,
      checkinTime: equipmentReservations.checkinTime,
      projectTitle: studioProjects.title,
    })
    .from(equipmentReservations)
    .leftJoin(studioProjects, eq(equipmentReservations.studioProjectId, studioProjects.id))
    .where(eq(equipmentReservations.assignedPersonnelId, id))
    .orderBy(desc(equipmentReservations.reservedFrom))
    .limit(10);

  // Activity logs timeline compilation
  const activityLogs: Array<{
    id: string;
    action: string;
    title: string;
    description: string;
    timestamp: Date | string;
    category: "info" | "skill" | "financial" | "equipment" | "project";
  }> = [
    {
      id: `created-${personnel.id}`,
      action: "REGISTER",
      title: "ثبت و ایجاد پرونده در سیستم",
      description: `ثبت پرونده اولیه به عنوان ${personnel.primaryRole || "عوامل استودیو"} (${personnel.personnelType === "freelancer" ? "آزادکار / پروژه‌ای" : "پرسنل استخدامی ثابت"})`,
      timestamp: personnel.createdAt,
      category: "info",
    },
  ];

  skills.forEach((s) => {
    activityLogs.push({
      id: `skill-${s.id}`,
      action: "SKILL_ADD",
      title: `افزودن تخصص: ${s.skillTitle}`,
      description: `سطح تسلط: ${s.proficiencyLevel === "master" ? "استادکار / ارشد" : s.proficiencyLevel === "senior" ? "پیشرفته" : s.proficiencyLevel === "mid" ? "متوسط" : "مقدماتی"}${s.certified ? " (دارای مدرک معتبر)" : ""}`,
      timestamp: s.createdAt,
      category: "skill",
    });
  });

  salaryRecords.forEach((sr) => {
    activityLogs.push({
      id: `salary-${sr.id}`,
      action: "SALARY_RECORD",
      title: `محاسبه کارکرد مالی (${sr.salaryType === "fixed_salary" ? "حقوق ثابت" : sr.salaryType === "per_project" ? "پروژه‌ای" : "فعالیتی/ساعتی"})`,
      description: `مبلغ: ${Number(sr.totalCalculated).toLocaleString("fa-IR")} تومان - وضعیت: ${sr.paymentStatus === "paid" ? "تسویه شده" : sr.paymentStatus === "approved" ? "تأیید شده" : "در انتظار"} ${sr.projectTitle ? `(پروژه: ${sr.projectTitle})` : ""}`,
      timestamp: sr.createdAt,
      category: "financial",
    });
  });

  reservations.forEach((r) => {
    activityLogs.push({
      id: `res-${r.id}`,
      action: "EQUIPMENT_ASSIGN",
      title: `تخصیص و آفیش تجهیز استودیو`,
      description: `وضعیت آفیش: ${r.status === "checked_out" ? "تحویل داده شده روی ست" : r.status === "returned" ? "عودت به انبار" : "رزرو"} ${r.projectTitle ? `(پروژه: ${r.projectTitle})` : ""}`,
      timestamp: r.reservedFrom,
      category: "equipment",
    });
  });

  activityLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return {
    ...personnel,
    rating: Number(personnel.rating || 5),
    skills,
    salaryRecords,
    reservations,
    activityLogs,
  };
}

export async function createStudioPersonnel(input: CreatePersonnelInput) {
  if (!input.fullName || !input.fullName.trim()) {
    throw new ApiError(400, "نام و نام خانوادگی پرسنل الزامی است.");
  }
  if (!input.mobile || !input.mobile.trim()) {
    throw new ApiError(400, "شماره موبایل پرسنل الزامی است.");
  }

  const cleanMobile = input.mobile.trim();
  if (!/^09\d{9}$/.test(cleanMobile)) {
    throw new ApiError(400, "فرمت شماره همراه معتبر نیست (مثال: 09121234567).");
  }

  if (input.employeeId) {
    assertUuid(input.employeeId);
    const [emp] = await db.select({ id: employees.id }).from(employees).where(eq(employees.id, input.employeeId)).limit(1);
    if (!emp) {
      throw new ApiError(404, "کارمند سازمانی انتخاب‌شده یافت نشد.");
    }
  }

  const role = input.primaryRole?.trim() || "photographer";
  const personnelType = input.personnelType === "temporary_worker" ? "temporary_worker" : "employee";
  const rating = input.rating !== undefined ? Math.min(5, Math.max(1, Number(input.rating))).toFixed(2) : "5.00";
  const experienceYears = input.experienceYears !== undefined ? Math.max(0, Number(input.experienceYears)) : 1;

  return db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(studioPersonnel)
      .values({
        employeeId: input.employeeId || null,
        personnelType,
        fullName: input.fullName.trim(),
        mobile: cleanMobile,
        primaryRole: role,
        portfolioUrl: input.portfolioUrl?.trim() || null,
        experienceYears,
        rating,
        status: input.status || "active",
        notes: input.notes?.trim() || null,
      })
      .returning();

    if (input.skills && Array.isArray(input.skills) && input.skills.length > 0) {
      for (const skill of input.skills) {
        if (skill.skillTitle && skill.skillTitle.trim()) {
          await tx.insert(personnelSkills).values({
            personnelId: inserted.id,
            skillTitle: skill.skillTitle.trim(),
            skillCategory: skill.skillCategory?.trim() || "shooting",
            proficiencyLevel: skill.proficiencyLevel || "senior",
            certified: Boolean(skill.certified),
            notes: skill.notes?.trim() || null,
          });
        }
      }
    }

    return inserted;
  });
}

export async function updateStudioPersonnel(id: string, input: UpdatePersonnelInput) {
  assertUuid(id);

  const [existing] = await db.select().from(studioPersonnel).where(eq(studioPersonnel.id, id)).limit(1);
  if (!existing) {
    throw new ApiError(404, "پرسنل موردنظر یافت نشد.");
  }

  const updateData: Partial<typeof studioPersonnel.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.fullName !== undefined) {
    if (!input.fullName.trim()) throw new ApiError(400, "نام پرسنل نباید خالی باشد.");
    updateData.fullName = input.fullName.trim();
  }

  if (input.mobile !== undefined) {
    const cleanMobile = input.mobile.trim();
    if (!/^09\d{9}$/.test(cleanMobile)) {
      throw new ApiError(400, "فرمت شماره همراه معتبر نیست (مثال: 09121234567).");
    }
    updateData.mobile = cleanMobile;
  }

  if (input.employeeId !== undefined) {
    if (input.employeeId) {
      assertUuid(input.employeeId);
      const [emp] = await db.select({ id: employees.id }).from(employees).where(eq(employees.id, input.employeeId)).limit(1);
      if (!emp) throw new ApiError(404, "کارمند سازمانی یافت نشد.");
      updateData.employeeId = input.employeeId;
    } else {
      updateData.employeeId = null;
    }
  }

  if (input.personnelType !== undefined) {
    updateData.personnelType = input.personnelType === "temporary_worker" ? "temporary_worker" : "employee";
  }

  if (input.primaryRole !== undefined) {
    updateData.primaryRole = input.primaryRole.trim();
  }

  if (input.portfolioUrl !== undefined) {
    updateData.portfolioUrl = input.portfolioUrl ? input.portfolioUrl.trim() : null;
  }

  if (input.experienceYears !== undefined) {
    updateData.experienceYears = Math.max(0, Number(input.experienceYears));
  }

  if (input.rating !== undefined) {
    updateData.rating = Math.min(5, Math.max(1, Number(input.rating))).toFixed(2);
  }

  if (input.status !== undefined) {
    if (!["active", "on_leave", "inactive"].includes(input.status)) {
      throw new ApiError(400, "وضعیت پرسنل نامعتبر است.");
    }
    updateData.status = input.status;
  }

  if (input.notes !== undefined) {
    updateData.notes = input.notes ? input.notes.trim() : null;
  }

  const [updated] = await db
    .update(studioPersonnel)
    .set(updateData)
    .where(eq(studioPersonnel.id, id))
    .returning();

  return updated;
}

export async function deleteStudioPersonnel(id: string) {
  assertUuid(id);

  return db.transaction(async (tx) => {
    const [personnel] = await tx.select().from(studioPersonnel).where(eq(studioPersonnel.id, id)).limit(1);
    if (!personnel) {
      throw new ApiError(404, "پرسنل موردنظر یافت نشد.");
    }

    // Check if there are financial records, reservations, or tasks
    const [salaryCount] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(personnelSalaryRecords)
      .where(eq(personnelSalaryRecords.personnelId, id));

    const [resCount] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(equipmentReservations)
      .where(eq(equipmentReservations.assignedPersonnelId, id));

    const hasHistory = (salaryCount?.count || 0) > 0 || (resCount?.count || 0) > 0;

    if (hasHistory) {
      // Soft-delete to preserve audit logs & financial records
      await tx
        .update(studioPersonnel)
        .set({ status: "inactive", updatedAt: new Date() })
        .where(eq(studioPersonnel.id, id));

      return {
        success: true,
        archived: true,
        message: `پرسنل «${personnel.fullName}» به دلیل داشتن سوابق دستمزد یا رزرو تجهیزات، به حالت غیرفعال درآمد و سوابق مالی حفظ شد.`,
      };
    } else {
      await tx.delete(personnelSkills).where(eq(personnelSkills.personnelId, id));
      await tx.delete(studioPersonnel).where(eq(studioPersonnel.id, id));

      return {
        success: true,
        archived: false,
        message: `پرسنل «${personnel.fullName}» با موفقیت حذف شد.`,
      };
    }
  });
}

export async function addPersonnelSkill(personnelId: string, skillData: {
  skillTitle: string;
  skillCategory: string;
  proficiencyLevel?: "junior" | "mid" | "senior" | "master";
  certified?: boolean;
  notes?: string;
}) {
  assertUuid(personnelId);
  if (!skillData.skillTitle || !skillData.skillTitle.trim()) {
    throw new ApiError(400, "عنوان مهارت الزامی است.");
  }

  const [personnel] = await db.select({ id: studioPersonnel.id }).from(studioPersonnel).where(eq(studioPersonnel.id, personnelId)).limit(1);
  if (!personnel) throw new ApiError(404, "پرسنل یافت نشد.");

  const [existing] = await db
    .select({ id: personnelSkills.id })
    .from(personnelSkills)
    .where(
      and(
        eq(personnelSkills.personnelId, personnelId),
        eq(personnelSkills.skillTitle, skillData.skillTitle.trim())
      )
    )
    .limit(1);

  if (existing) {
    throw new ApiError(409, "این مهارت قبلاً برای این شخص ثبت شده است.");
  }

  const [skill] = await db
    .insert(personnelSkills)
    .values({
      personnelId,
      skillTitle: skillData.skillTitle.trim(),
      skillCategory: skillData.skillCategory?.trim() || "shooting",
      proficiencyLevel: skillData.proficiencyLevel || "senior",
      certified: Boolean(skillData.certified),
      notes: skillData.notes?.trim() || null,
    })
    .returning();

  return skill;
}

export async function deletePersonnelSkill(skillId: string) {
  assertUuid(skillId);
  const [deleted] = await db.delete(personnelSkills).where(eq(personnelSkills.id, skillId)).returning();
  if (!deleted) throw new ApiError(404, "مهارت یافت نشد.");
  return deleted;
}

export async function getPersonnelSchedule(personnelId: string, fromDate?: Date, toDate?: Date) {
  assertUuid(personnelId);

  // Calendar events where this personnel is assigned
  const allEvents = await db
    .select({
      id: studioCalendarEvents.id,
      studioProjectId: studioCalendarEvents.studioProjectId,
      title: studioCalendarEvents.title,
      eventType: studioCalendarEvents.eventType,
      startTime: studioCalendarEvents.startTime,
      endTime: studioCalendarEvents.endTime,
      location: studioCalendarEvents.location,
      assignedPersonnelIds: studioCalendarEvents.assignedPersonnelIds,
      status: studioCalendarEvents.status,
      notes: studioCalendarEvents.notes,
      projectTitle: studioProjects.title,
      projectNumber: studioProjects.projectNumber,
    })
    .from(studioCalendarEvents)
    .leftJoin(studioProjects, eq(studioCalendarEvents.studioProjectId, studioProjects.id))
    .orderBy(studioCalendarEvents.startTime);

  // Filter events matching personnelId
  const matchingEvents = allEvents.filter((ev) => {
    const ids = Array.isArray(ev.assignedPersonnelIds) ? ev.assignedPersonnelIds : [];
    const hasPersonnel = ids.includes(personnelId);
    if (!hasPersonnel) return false;
    if (fromDate && new Date(ev.endTime) < fromDate) return false;
    if (toDate && new Date(ev.startTime) > toDate) return false;
    return true;
  });

  // Equipment reservations
  const resConditions = [eq(equipmentReservations.assignedPersonnelId, personnelId)];
  if (fromDate) resConditions.push(sql`${equipmentReservations.reservedTo} >= ${fromDate}`);
  if (toDate) resConditions.push(sql`${equipmentReservations.reservedFrom} <= ${toDate}`);

  const matchingReservations = await db
    .select({
      id: equipmentReservations.id,
      equipmentId: equipmentReservations.equipmentId,
      studioProjectId: equipmentReservations.studioProjectId,
      reservedFrom: equipmentReservations.reservedFrom,
      reservedTo: equipmentReservations.reservedTo,
      status: equipmentReservations.status,
      projectTitle: studioProjects.title,
    })
    .from(equipmentReservations)
    .leftJoin(studioProjects, eq(equipmentReservations.studioProjectId, studioProjects.id))
    .where(and(...resConditions))
    .orderBy(equipmentReservations.reservedFrom);

  // Assigned Tasks
  const matchingTasks = await db
    .select({
      id: studioTasks.id,
      title: studioTasks.title,
      stage: studioTasks.stage,
      priority: studioTasks.priority,
      status: studioTasks.status,
      dueDate: studioTasks.dueDate,
      projectTitle: studioProjects.title,
    })
    .from(studioTasks)
    .leftJoin(studioProjects, eq(studioTasks.studioProjectId, studioProjects.id))
    .where(eq(studioTasks.assignedPersonnelId, personnelId))
    .orderBy(studioTasks.dueDate);

  return {
    events: matchingEvents,
    reservations: matchingReservations,
    tasks: matchingTasks,
  };
}

export async function recordPersonnelSalary(input: {
  personnelId: string;
  studioProjectId?: string | null;
  salaryType?: "per_project" | "per_hour" | "per_photo" | "percentage" | "fixed_salary";
  rateAmount: number | string;
  unitsCount?: number | string;
  notes?: string;
}) {
  assertUuid(input.personnelId);
  if (input.studioProjectId) assertUuid(input.studioProjectId);

  const rate = Number(decimal(input.rateAmount, "نرخ دستمزد", 2, true));
  const units = Number(decimal(input.unitsCount ?? 1, "تعداد واحد یا ساعت", 2, true));

  // Business Logic in Backend: total calculation must not be decided by Frontend
  const total = (rate * units).toFixed(2);

  const [record] = await db
    .insert(personnelSalaryRecords)
    .values({
      personnelId: input.personnelId,
      studioProjectId: input.studioProjectId || null,
      salaryType: input.salaryType || "per_project",
      rateAmount: rate.toFixed(2),
      unitsCount: units.toFixed(2),
      totalCalculated: total,
      paymentStatus: "pending",
      notes: input.notes?.trim() || null,
    })
    .returning();

  return record;
}

export async function updatePersonnelSalaryStatus(
  salaryId: string,
  status: "pending" | "approved" | "paid",
  settlementDate?: Date | string
) {
  assertUuid(salaryId);
  if (!["pending", "approved", "paid"].includes(status)) {
    throw new ApiError(400, "وضعیت پرداخت نامعتبر است.");
  }

  const sDate = status === "paid" ? (settlementDate ? new Date(settlementDate) : new Date()) : null;

  const [updated] = await db
    .update(personnelSalaryRecords)
    .set({
      paymentStatus: status,
      settlementDate: sDate,
      updatedAt: new Date(),
    })
    .where(eq(personnelSalaryRecords.id, salaryId))
    .returning();

  if (!updated) {
    throw new ApiError(404, "رکورد دستمزد یافت نشد.");
  }

  return updated;
}

export async function deletePersonnelSalaryRecord(salaryId: string) {
  assertUuid(salaryId);
  const [deleted] = await db
    .delete(personnelSalaryRecords)
    .where(eq(personnelSalaryRecords.id, salaryId))
    .returning();

  if (!deleted) {
    throw new ApiError(404, "رکورد دستمزد یافت نشد.");
  }

  return { success: true, message: "رکورد دستمزد با موفقیت حذف گردید." };
}

