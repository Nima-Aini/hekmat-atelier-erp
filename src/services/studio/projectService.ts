import { db } from "@/db";
import {
  studioProjects,
  studioCustomers,
  customers,
  studioContracts,
  studioPersonnel,
  personnelSalaryRecords,
  studioEquipment,
  equipmentReservations,
  rentalEquipment,
  studioProductionPlans,
  studioProductionSteps,
  studioCalendarEvents,
  studioTasks,
  studioProjectTimelines,
  studioProjectPayments,
  studioProjectExpenses,
  employees,
  suppliers,
} from "@/db/schema";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { ApiError, assertUuid, decimal, pageNumber } from "@/lib/apiError";
import { getNextSequenceCode } from "@/services/sequence";
import { checkEquipmentAvailability } from "./equipmentService";

// ==========================================
// TYPES & INTERFACES
// ==========================================

export interface CreateProjectInput {
  studioCustomerId: string;
  title: string;
  eventType?: string | null;
  packageType?: string | null;
  eventDate?: Date | string | null;
  mainLocation?: string | null;
  backupLocation?: string | null;
  status?: string | null;
  managerEmployeeId?: string | null;
  totalContractValue?: number | string | null;
  shootingBrief?: string | null;
  notes?: string | null;
  authorName?: string | null;
}

export interface UpdateProjectInput {
  title?: string;
  eventType?: string | null;
  packageType?: string | null;
  eventDate?: Date | string | null;
  mainLocation?: string | null;
  backupLocation?: string | null;
  status?: string | null;
  managerEmployeeId?: string | null;
  totalContractValue?: number | string | null;
  shootingBrief?: string | null;
  notes?: string | null;
  authorName?: string | null;
}

export interface CreateContractInput {
  totalAmount: number | string;
  depositAmount?: number | string | null;
  installmentsCount?: number;
  contractDate?: Date | string | null;
  deliveryCommitmentDate?: Date | string | null;
  termsAndConditions?: string | null;
  signedDocumentUrl?: string | null;
  status?: "draft" | "sent" | "signed" | "in_progress" | "completed" | "cancelled";
  authorName?: string | null;
}

export interface UpdateContractInput {
  totalAmount?: number | string;
  depositAmount?: number | string | null;
  installmentsCount?: number;
  contractDate?: Date | string | null;
  deliveryCommitmentDate?: Date | string | null;
  termsAndConditions?: string | null;
  signedDocumentUrl?: string | null;
  status?: "draft" | "sent" | "signed" | "in_progress" | "completed" | "cancelled";
  authorName?: string | null;
}

export interface CreatePaymentInput {
  amount: number | string;
  paymentType?: "deposit" | "installment_1" | "installment_2" | "settlement" | "extra";
  paymentMethod?: "card_transfer" | "pos" | "cash" | "cheque" | "online";
  referenceCode?: string | null;
  paidAt?: Date | string | null;
  status?: "received" | "pending" | "verified";
  notes?: string | null;
  authorName?: string | null;
}

export interface CreateExpenseInput {
  expenseCategory?: "personnel" | "rental" | "location" | "printing_album" | "catering" | "transport" | "retouch_edit" | "misc";
  title: string;
  amount: number | string;
  recipientName?: string | null;
  paidAt?: Date | string | null;
  paymentStatus?: "paid" | "pending";
  notes?: string | null;
  authorName?: string | null;
}

export interface AssignPersonnelInput {
  personnelId: string;
  salaryType?: "per_project" | "per_hour" | "per_photo" | "percentage" | "fixed_salary";
  rateAmount: number | string;
  unitsCount?: number | string;
  notes?: string | null;
  authorName?: string | null;
}

export interface AddRentalInput {
  supplierId?: string | null;
  itemTitle: string;
  rentalCompany?: string | null;
  rentalCost: number | string;
  depositGuarantee?: number | string | null;
  pickupDate: Date | string;
  returnDate: Date | string;
  notes?: string | null;
  authorName?: string | null;
}

export interface ReserveEquipmentForProjectInput {
  equipmentId: string;
  assignedPersonnelId?: string | null;
  reservedFrom: Date | string;
  reservedTo: Date | string;
  notes?: string | null;
  authorName?: string | null;
}

export interface AddTimelineLogInput {
  actionType: string;
  title: string;
  description?: string | null;
  authorName?: string | null;
  metadata?: any;
}

// Pipeline Stages requested:
// Lead -> Contact -> Proposal -> Contract -> Active Project (plus Completed & Cancelled)
export const PIPELINE_STAGES = [
  { id: "lead", title: "سرنخ (Lead)", color: "#3B82F6", order: 1 },
  { id: "contact", title: "مشاوره و تماس (Contact)", color: "#8B5CF6", order: 2 },
  { id: "proposal", title: "پیشنهاد و پکیج (Proposal)", color: "#EC4899", order: 3 },
  { id: "contract", title: "عقد قرارداد (Contract)", color: "#F59E0B", order: 4 },
  { id: "active_project", title: "پروژه فعال (Active Project)", color: "#10B981", order: 5 },
  { id: "completed", title: "تکمیل و تحویل (Completed)", color: "#065F46", order: 6 },
  { id: "cancelled", title: "لغو شده (Cancelled)", color: "#EF4444", order: 7 },
] as const;

export const VALID_PROJECT_STATUSES = [
  "lead",
  "contact",
  "proposal",
  "contract",
  "active_project",
  "booked",
  "shooting",
  "in_post_production",
  "ready_for_review",
  "approved",
  "delivered",
  "completed",
  "cancelled",
] as const;

export function getStageTitle(status: string): string {
  const match = PIPELINE_STAGES.find((s) => s.id === status);
  if (match) return match.title;
  if (["booked", "shooting", "in_post_production", "ready_for_review", "approved"].includes(status)) {
    return "پروژه فعال (Active Project)";
  }
  if (status === "delivered") return "تحویل نهایی";
  return status;
}

// ==========================================
// TIMELINE LOGGING HELPER
// ==========================================

export async function logProjectTimeline(
  projectId: string,
  input: AddTimelineLogInput,
  tx?: any
) {
  assertUuid(projectId);
  const dbClient = tx || db;

  const [log] = await dbClient
    .insert(studioProjectTimelines)
    .values({
      studioProjectId: projectId,
      actionType: input.actionType,
      title: input.title,
      description: input.description?.trim() || null,
      authorName: input.authorName?.trim() || "مدیر استودیو",
      metadata: input.metadata || {},
    })
    .returning();

  return log;
}

export async function getProjectTimeline(projectId: string) {
  assertUuid(projectId);

  const logs = await db
    .select()
    .from(studioProjectTimelines)
    .where(eq(studioProjectTimelines.studioProjectId, projectId))
    .orderBy(desc(studioProjectTimelines.createdAt));

  return logs;
}

// ==========================================
// PIPELINE VIEW & SUMMARY
// ==========================================

export async function getStudioPipeline() {
  // Fetch all projects with customer and contract overview
  const projectsList = await db
    .select({
      id: studioProjects.id,
      projectNumber: studioProjects.projectNumber,
      studioCustomerId: studioProjects.studioCustomerId,
      title: studioProjects.title,
      eventType: studioProjects.eventType,
      packageType: studioProjects.packageType,
      eventDate: studioProjects.eventDate,
      mainLocation: studioProjects.mainLocation,
      status: studioProjects.status,
      totalContractValue: studioProjects.totalContractValue,
      shootingBrief: studioProjects.shootingBrief,
      notes: studioProjects.notes,
      createdAt: studioProjects.createdAt,
      updatedAt: studioProjects.updatedAt,
      customerName: customers.name,
      customerMobile: customers.mobile,
      customerAddress: customers.address,
      socialMedia: studioCustomers.socialMedia,
      referrer: studioCustomers.referrer,
      groomName: studioCustomers.groomName,
      brideName: studioCustomers.brideName,
      vipLevel: studioCustomers.vipLevel,
      managerName: employees.name,
    })
    .from(studioProjects)
    .innerJoin(studioCustomers, eq(studioProjects.studioCustomerId, studioCustomers.id))
    .innerJoin(customers, eq(studioCustomers.customerId, customers.id))
    .leftJoin(employees, eq(studioProjects.managerEmployeeId, employees.id))
    .orderBy(desc(studioProjects.createdAt));

  // Fetch payments to calculate paid amounts per project
  const allPayments = await db
    .select({
      studioProjectId: studioProjectPayments.studioProjectId,
      amount: studioProjectPayments.amount,
      status: studioProjectPayments.status,
    })
    .from(studioProjectPayments)
    .where(eq(studioProjectPayments.status, "received"));

  // Fetch contracts to calculate signed contracts
  const allContracts = await db
    .select({
      id: studioContracts.id,
      contractNumber: studioContracts.contractNumber,
      studioProjectId: studioContracts.studioProjectId,
      totalAmount: studioContracts.totalAmount,
      status: studioContracts.status,
    })
    .from(studioContracts);

  const paymentsMap: Record<string, number> = {};
  for (const p of allPayments) {
    paymentsMap[p.studioProjectId] = (paymentsMap[p.studioProjectId] || 0) + Number(p.amount);
  }

  const contractsMap: Record<string, any[]> = {};
  for (const c of allContracts) {
    if (!contractsMap[c.studioProjectId]) contractsMap[c.studioProjectId] = [];
    contractsMap[c.studioProjectId].push(c);
  }

  // Group by Pipeline Stages
  const stagesData: Record<string, any[]> = {
    lead: [],
    contact: [],
    proposal: [],
    contract: [],
    active_project: [],
    completed: [],
    cancelled: [],
  };

  let totalPipelineValue = 0;
  let activeProjectsCount = 0;
  let wonProjectsCount = 0;

  for (const p of projectsList) {
    const val = Number(p.totalContractValue || 0);
    const paid = paymentsMap[p.id] || 0;
    const projectContracts = contractsMap[p.id] || [];

    const enrichedProject = {
      ...p,
      paidAmount: paid,
      remainingAmount: Math.max(0, val - paid),
      hasSignedContract: projectContracts.some((c) => c.status === "signed"),
      contractsCount: projectContracts.length,
    };

    // Normalize status into pipeline stage bucket
    let stageBucket = p.status;
    if (["booked", "shooting", "in_post_production", "ready_for_review", "approved"].includes(p.status)) {
      stageBucket = "active_project";
    } else if (p.status === "delivered") {
      stageBucket = "completed";
    }

    if (!stagesData[stageBucket]) {
      stagesData[stageBucket] = [];
    }
    stagesData[stageBucket].push(enrichedProject);

    if (stageBucket !== "cancelled") {
      totalPipelineValue += val;
    }
    if (stageBucket === "active_project") {
      activeProjectsCount++;
    }
    if (["contract", "active_project", "completed"].includes(stageBucket)) {
      wonProjectsCount++;
    }
  }

  const totalProjects = projectsList.length;
  const winRate = totalProjects > 0 ? ((wonProjectsCount / totalProjects) * 100).toFixed(1) : "0";

  return {
    pipeline: PIPELINE_STAGES.map((s) => ({
      stageId: s.id,
      title: s.title,
      color: s.color,
      count: stagesData[s.id]?.length || 0,
      totalValue: (stagesData[s.id] || []).reduce((sum, item) => sum + Number(item.totalContractValue || 0), 0),
      projects: stagesData[s.id] || [],
    })),
    stats: {
      totalProjects,
      totalPipelineValue,
      leadsCount: stagesData.lead?.length || 0,
      activeProjectsCount,
      completedCount: stagesData.completed?.length || 0,
      winRate: `${winRate}%`,
    },
  };
}

export async function updateStudioProjectStage(
  projectId: string,
  newStage: string,
  note?: string,
  authorName: string = "مدیر استودیو"
) {
  assertUuid(projectId);

  if (!VALID_PROJECT_STATUSES.includes(newStage as any)) {
    throw new ApiError(400, "مرحله یا وضعیت نامعتبر است.");
  }

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: studioProjects.id,
        projectNumber: studioProjects.projectNumber,
        title: studioProjects.title,
        status: studioProjects.status,
      })
      .from(studioProjects)
      .where(eq(studioProjects.id, projectId))
      .limit(1);

    if (!existing) throw new ApiError(404, "پروژه یافت نشد.");

    const prevStageTitle = getStageTitle(existing.status);
    const newStageTitle = getStageTitle(newStage);

    const [updated] = await tx
      .update(studioProjects)
      .set({
        status: newStage,
        updatedAt: new Date(),
      })
      .where(eq(studioProjects.id, projectId))
      .returning();

    // Log to Timeline
    await logProjectTimeline(
      projectId,
      {
        actionType: "STAGE_CHANGE",
        title: `تغییر مرحله پایپ‌لاین به «${newStageTitle}»`,
        description: note || `پروژه از مرحله «${prevStageTitle}» به «${newStageTitle}» منتقل شد.`,
        authorName,
        metadata: {
          previousStatus: existing.status,
          newStatus: newStage,
        },
      },
      tx
    );

    return updated;
  });
}

// ==========================================
// LIST & GET PROJECT
// ==========================================

export async function listStudioProjects(filter: {
  search?: string;
  status?: string;
  eventType?: string;
  customerId?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = pageNumber(filter.page ? String(filter.page) : null, 1);
  const pageSize = pageNumber(filter.pageSize ? String(filter.pageSize) : null, 20, 100);
  const offset = (page - 1) * pageSize;

  const conditions = [];

  if (filter.status && filter.status !== "all") {
    conditions.push(eq(studioProjects.status, filter.status));
  }

  if (filter.eventType && filter.eventType !== "all") {
    conditions.push(eq(studioProjects.eventType, filter.eventType));
  }

  if (filter.customerId) {
    assertUuid(filter.customerId);
    conditions.push(eq(studioProjects.studioCustomerId, filter.customerId));
  }

  if (filter.search && filter.search.trim()) {
    const pattern = `%${filter.search.trim()}%`;
    conditions.push(
      or(
        ilike(studioProjects.title, pattern),
        ilike(studioProjects.projectNumber, pattern),
        ilike(customers.name, pattern),
        ilike(customers.mobile, pattern),
        ilike(studioCustomers.groomName, pattern),
        ilike(studioCustomers.brideName, pattern),
        ilike(studioProjects.mainLocation, pattern)
      )!
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(studioProjects)
    .innerJoin(studioCustomers, eq(studioProjects.studioCustomerId, studioCustomers.id))
    .innerJoin(customers, eq(studioCustomers.customerId, customers.id))
    .where(whereClause);

  const total = countRow?.total || 0;

  const list = await db
    .select({
      id: studioProjects.id,
      projectNumber: studioProjects.projectNumber,
      studioCustomerId: studioProjects.studioCustomerId,
      title: studioProjects.title,
      eventType: studioProjects.eventType,
      packageType: studioProjects.packageType,
      eventDate: studioProjects.eventDate,
      mainLocation: studioProjects.mainLocation,
      backupLocation: studioProjects.backupLocation,
      status: studioProjects.status,
      managerEmployeeId: studioProjects.managerEmployeeId,
      totalContractValue: studioProjects.totalContractValue,
      shootingBrief: studioProjects.shootingBrief,
      notes: studioProjects.notes,
      createdAt: studioProjects.createdAt,
      updatedAt: studioProjects.updatedAt,
      customerName: customers.name,
      customerMobile: customers.mobile,
      customerAddress: customers.address,
      socialMedia: studioCustomers.socialMedia,
      referrer: studioCustomers.referrer,
      groomName: studioCustomers.groomName,
      brideName: studioCustomers.brideName,
      managerName: employees.name,
    })
    .from(studioProjects)
    .innerJoin(studioCustomers, eq(studioProjects.studioCustomerId, studioCustomers.id))
    .innerJoin(customers, eq(studioCustomers.customerId, customers.id))
    .leftJoin(employees, eq(studioProjects.managerEmployeeId, employees.id))
    .where(whereClause)
    .orderBy(desc(studioProjects.createdAt))
    .limit(pageSize)
    .offset(offset);

  return {
    projects: list,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

export async function getStudioProjectById(id: string) {
  assertUuid(id);

  const [project] = await db
    .select({
      id: studioProjects.id,
      projectNumber: studioProjects.projectNumber,
      studioCustomerId: studioProjects.studioCustomerId,
      title: studioProjects.title,
      eventType: studioProjects.eventType,
      packageType: studioProjects.packageType,
      eventDate: studioProjects.eventDate,
      mainLocation: studioProjects.mainLocation,
      backupLocation: studioProjects.backupLocation,
      status: studioProjects.status,
      managerEmployeeId: studioProjects.managerEmployeeId,
      totalContractValue: studioProjects.totalContractValue,
      shootingBrief: studioProjects.shootingBrief,
      notes: studioProjects.notes,
      createdAt: studioProjects.createdAt,
      updatedAt: studioProjects.updatedAt,
      customerName: customers.name,
      customerMobile: customers.mobile,
      customerAddress: customers.address,
      socialMedia: studioCustomers.socialMedia,
      referrer: studioCustomers.referrer,
      customerNotes: studioCustomers.notes,
      groomName: studioCustomers.groomName,
      brideName: studioCustomers.brideName,
      customerVipLevel: studioCustomers.vipLevel,
      socialConsent: studioCustomers.socialConsent,
      managerName: employees.name,
    })
    .from(studioProjects)
    .innerJoin(studioCustomers, eq(studioProjects.studioCustomerId, studioCustomers.id))
    .innerJoin(customers, eq(studioCustomers.customerId, customers.id))
    .leftJoin(employees, eq(studioProjects.managerEmployeeId, employees.id))
    .where(eq(studioProjects.id, id))
    .limit(1);

  if (!project) {
    throw new ApiError(404, "پروژه آتلیه یافت نشد.");
  }

  // 1. Contracts
  const contracts = await db
    .select()
    .from(studioContracts)
    .where(eq(studioContracts.studioProjectId, id))
    .orderBy(desc(studioContracts.createdAt));

  // 2. Payments (دریافتی‌ها)
  const payments = await db
    .select()
    .from(studioProjectPayments)
    .where(eq(studioProjectPayments.studioProjectId, id))
    .orderBy(desc(studioProjectPayments.paidAt));

  // 3. Expenses (هزینه‌ها)
  const expenses = await db
    .select()
    .from(studioProjectExpenses)
    .where(eq(studioProjectExpenses.studioProjectId, id))
    .orderBy(desc(studioProjectExpenses.paidAt));

  // 4. Personnel salary records (عوامل و پرسنل)
  const assignedPersonnel = await db
    .select({
      id: personnelSalaryRecords.id,
      personnelId: personnelSalaryRecords.personnelId,
      fullName: studioPersonnel.fullName,
      mobile: studioPersonnel.mobile,
      primaryRole: studioPersonnel.primaryRole,
      salaryType: personnelSalaryRecords.salaryType,
      rateAmount: personnelSalaryRecords.rateAmount,
      unitsCount: personnelSalaryRecords.unitsCount,
      totalCalculated: personnelSalaryRecords.totalCalculated,
      paymentStatus: personnelSalaryRecords.paymentStatus,
      settlementDate: personnelSalaryRecords.settlementDate,
      notes: personnelSalaryRecords.notes,
    })
    .from(personnelSalaryRecords)
    .innerJoin(studioPersonnel, eq(personnelSalaryRecords.personnelId, studioPersonnel.id))
    .where(eq(personnelSalaryRecords.studioProjectId, id))
    .orderBy(desc(personnelSalaryRecords.createdAt));

  // 5. Equipment Reservations (رزرو تجهیزات)
  const reservations = await db
    .select({
      id: equipmentReservations.id,
      equipmentId: equipmentReservations.equipmentId,
      equipmentCode: studioEquipment.code,
      equipmentTitle: studioEquipment.title,
      equipmentCategory: studioEquipment.category,
      assignedPersonnelId: equipmentReservations.assignedPersonnelId,
      personnelName: studioPersonnel.fullName,
      reservedFrom: equipmentReservations.reservedFrom,
      reservedTo: equipmentReservations.reservedTo,
      status: equipmentReservations.status,
      checkoutTime: equipmentReservations.checkoutTime,
      checkinTime: equipmentReservations.checkinTime,
      notes: equipmentReservations.notes,
    })
    .from(equipmentReservations)
    .innerJoin(studioEquipment, eq(equipmentReservations.equipmentId, studioEquipment.id))
    .leftJoin(studioPersonnel, eq(equipmentReservations.assignedPersonnelId, studioPersonnel.id))
    .where(eq(equipmentReservations.studioProjectId, id))
    .orderBy(equipmentReservations.reservedFrom);

  // 6. Rental equipment (کرایه تجهیزات)
  const rentals = await db
    .select({
      id: rentalEquipment.id,
      supplierId: rentalEquipment.supplierId,
      supplierName: suppliers.name,
      itemTitle: rentalEquipment.itemTitle,
      rentalCompany: rentalEquipment.rentalCompany,
      rentalCost: rentalEquipment.rentalCost,
      depositGuarantee: rentalEquipment.depositGuarantee,
      pickupDate: rentalEquipment.pickupDate,
      returnDate: rentalEquipment.returnDate,
      notes: rentalEquipment.notes,
      createdAt: rentalEquipment.createdAt,
    })
    .from(rentalEquipment)
    .leftJoin(suppliers, eq(rentalEquipment.supplierId, suppliers.id))
    .where(eq(rentalEquipment.studioProjectId, id))
    .orderBy(desc(rentalEquipment.pickupDate));

  // 7. Production plan & steps
  const [productionPlan] = await db
    .select()
    .from(studioProductionPlans)
    .where(eq(studioProductionPlans.studioProjectId, id))
    .limit(1);

  let steps: any[] = [];
  if (productionPlan) {
    steps = await db
      .select({
        id: studioProductionSteps.id,
        stepName: studioProductionSteps.stepName,
        assignedPersonnelId: studioProductionSteps.assignedPersonnelId,
        personnelName: studioPersonnel.fullName,
        deadline: studioProductionSteps.deadline,
        status: studioProductionSteps.status,
        version: studioProductionSteps.version,
        previewLink: studioProductionSteps.previewLink,
        feedbackNotes: studioProductionSteps.feedbackNotes,
        completedAt: studioProductionSteps.completedAt,
      })
      .from(studioProductionSteps)
      .leftJoin(studioPersonnel, eq(studioProductionSteps.assignedPersonnelId, studioPersonnel.id))
      .where(eq(studioProductionSteps.planId, productionPlan.id))
      .orderBy(studioProductionSteps.createdAt);
  }

  // 8. Timelines (لاگ کامل تغییرات)
  const timelines = await db
    .select()
    .from(studioProjectTimelines)
    .where(eq(studioProjectTimelines.studioProjectId, id))
    .orderBy(desc(studioProjectTimelines.createdAt));

  // 9. Calendar events & Tasks
  const calendarEvents = await db
    .select()
    .from(studioCalendarEvents)
    .where(eq(studioCalendarEvents.studioProjectId, id))
    .orderBy(studioCalendarEvents.startTime);

  const tasks = await db
    .select({
      id: studioTasks.id,
      title: studioTasks.title,
      stage: studioTasks.stage,
      assignedPersonnelId: studioTasks.assignedPersonnelId,
      personnelName: studioPersonnel.fullName,
      priority: studioTasks.priority,
      status: studioTasks.status,
      dueDate: studioTasks.dueDate,
    })
    .from(studioTasks)
    .leftJoin(studioPersonnel, eq(studioTasks.assignedPersonnelId, studioPersonnel.id))
    .where(eq(studioTasks.studioProjectId, id))
    .orderBy(studioTasks.dueDate);

  // 10. Financial Calculations
  const contractTotal = Number(project.totalContractValue || 0) > 0
    ? Number(project.totalContractValue)
    : contracts.reduce((sum, c) => sum + Number(c.totalAmount || 0), 0);

  const totalPaymentsReceived = payments
    .filter((p) => p.status === "received")
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const directExpensesTotal = expenses
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const personnelCostTotal = assignedPersonnel
    .reduce((sum, p) => sum + Number(p.totalCalculated || 0), 0);

  const rentalCostTotal = rentals
    .reduce((sum, r) => sum + Number(r.rentalCost || 0), 0);

  const totalCost = directExpensesTotal + personnelCostTotal + rentalCostTotal;
  const grossProfit = contractTotal - totalCost;
  const remainingBalance = Math.max(0, contractTotal - totalPaymentsReceived);
  const marginPercent = contractTotal > 0 ? ((grossProfit / contractTotal) * 100).toFixed(1) : "0";

  return {
    ...project,
    contracts,
    payments,
    expenses,
    assignedPersonnel,
    reservations,
    rentals,
    productionPlan: productionPlan ? { ...productionPlan, steps } : null,
    timelines,
    calendarEvents,
    tasks,
    financialSummary: {
      contractTotal,
      totalPaymentsReceived,
      remainingBalance,
      directExpensesTotal,
      personnelCostTotal,
      rentalCostTotal,
      totalCost,
      grossProfit,
      marginPercent: `${marginPercent}%`,
    },
  };
}

// ==========================================
// CREATE & UPDATE PROJECT
// ==========================================

export async function createStudioProject(input: CreateProjectInput) {
  assertUuid(input.studioCustomerId);
  if (!input.title || !input.title.trim()) {
    throw new ApiError(400, "عنوان پروژه الزامی است.");
  }

  const [customer] = await db
    .select({
      id: studioCustomers.id,
      name: customers.name,
      mobile: customers.mobile,
    })
    .from(studioCustomers)
    .innerJoin(customers, eq(studioCustomers.customerId, customers.id))
    .where(eq(studioCustomers.id, input.studioCustomerId))
    .limit(1);

  if (!customer) {
    throw new ApiError(404, "مشتری آتلیه انتخاب‌شده یافت نشد.");
  }

  if (input.managerEmployeeId) {
    assertUuid(input.managerEmployeeId);
    const [emp] = await db.select({ id: employees.id }).from(employees).where(eq(employees.id, input.managerEmployeeId)).limit(1);
    if (!emp) throw new ApiError(404, "مدیر پروژه یافت نشد.");
  }

  const projectNumber = await getNextSequenceCode("studio_project");
  const contractVal = input.totalContractValue !== undefined && input.totalContractValue !== null
    ? decimal(input.totalContractValue, "مبلغ قرارداد", 2)
    : "0.00";

  const eventDate = input.eventDate ? new Date(input.eventDate) : new Date();
  const initialStatus = input.status || "lead";

  return db.transaction(async (tx) => {
    const [project] = await tx
      .insert(studioProjects)
      .values({
        projectNumber,
        studioCustomerId: input.studioCustomerId,
        title: input.title.trim(),
        eventType: input.eventType || "wedding",
        packageType: input.packageType?.trim() || "standard",
        eventDate,
        mainLocation: input.mainLocation?.trim() || null,
        backupLocation: input.backupLocation?.trim() || null,
        status: initialStatus,
        managerEmployeeId: input.managerEmployeeId || null,
        totalContractValue: contractVal,
        shootingBrief: input.shootingBrief?.trim() || null,
        notes: input.notes?.trim() || null,
      })
      .returning();

    // Log creation in timeline
    await logProjectTimeline(
      project.id,
      {
        actionType: "PROJECT_CREATED",
        title: "ایجاد پرونده پروژه جدید",
        description: `پروژه «${project.title}» برای مشتری «${customer.name}» در مرحله «${getStageTitle(initialStatus)}» ثبت گردید.`,
        authorName: input.authorName || "مدیر استودیو",
        metadata: {
          projectNumber,
          initialStatus,
          eventType: project.eventType,
          totalContractValue: contractVal,
        },
      },
      tx
    );

    // Initialize production plan
    const targetDelivery = new Date(eventDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    const [plan] = await tx
      .insert(studioProductionPlans)
      .values({
        studioProjectId: project.id,
        targetDeliveryDate: targetDelivery,
        currentStage: "raw_backup",
      })
      .returning();

    const standardSteps = [
      "پیش‌تولید و هماهنگی لوکیشن‌ها",
      "تصویربرداری و عکاسی مراسم",
      "انتقال داده‌ها و بک‌آپ آرشیو",
      "انتخاب شات‌ها و رتوش ژورنال",
      "تدوین تیزر و فیلم کامل (Edit & Color)",
      "چاپ، صحافی و تحویل نهایی به مشتری",
    ];

    for (const name of standardSteps) {
      await tx.insert(studioProductionSteps).values({
        planId: plan.id,
        stepName: name,
        status: "pending",
        deadline: targetDelivery,
      });
    }

    return project;
  });
}

export async function updateStudioProject(id: string, input: UpdateProjectInput) {
  assertUuid(id);

  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(studioProjects).where(eq(studioProjects.id, id)).limit(1);
    if (!existing) throw new ApiError(404, "پروژه یافت نشد.");

    const updateData: Partial<typeof studioProjects.$inferInsert> = {
      updatedAt: new Date(),
    };

    const changes: string[] = [];

    if (input.title !== undefined) {
      if (!input.title.trim()) throw new ApiError(400, "عنوان پروژه نباید خالی باشد.");
      if (existing.title !== input.title.trim()) {
        changes.push(`عنوان: ${input.title.trim()}`);
      }
      updateData.title = input.title.trim();
    }

    if (input.eventType !== undefined && input.eventType !== existing.eventType) {
      changes.push(`نوع رویداد: ${input.eventType}`);
      updateData.eventType = input.eventType || "wedding";
    }

    if (input.packageType !== undefined && input.packageType !== existing.packageType) {
      changes.push(`پکیج: ${input.packageType}`);
      updateData.packageType = input.packageType?.trim() || "standard";
    }

    if (input.eventDate !== undefined && input.eventDate !== null) {
      const newD = new Date(input.eventDate);
      if (existing.eventDate.toISOString() !== newD.toISOString()) {
        changes.push(`تاریخ برگزاری: ${newD.toLocaleDateString("fa-IR")}`);
      }
      updateData.eventDate = newD;
    }

    if (input.mainLocation !== undefined && input.mainLocation !== existing.mainLocation) {
      changes.push(`لوکیشن اصلی: ${input.mainLocation}`);
      updateData.mainLocation = input.mainLocation?.trim() || null;
    }

    if (input.backupLocation !== undefined) updateData.backupLocation = input.backupLocation?.trim() || null;

    if (input.status !== undefined && input.status !== null && input.status !== existing.status) {
      changes.push(`وضعیت: ${getStageTitle(input.status)}`);
      updateData.status = input.status;
    }

    if (input.managerEmployeeId !== undefined) {
      if (input.managerEmployeeId) {
        assertUuid(input.managerEmployeeId);
        const [emp] = await tx.select({ id: employees.id }).from(employees).where(eq(employees.id, input.managerEmployeeId)).limit(1);
        if (!emp) throw new ApiError(404, "مدیر پروژه یافت نشد.");
        updateData.managerEmployeeId = input.managerEmployeeId;
      } else {
        updateData.managerEmployeeId = null;
      }
    }

    if (input.totalContractValue !== undefined) {
      const val = input.totalContractValue !== null ? decimal(input.totalContractValue, "مبلغ کل قرارداد", 2) : "0.00";
      if (Number(existing.totalContractValue) !== Number(val)) {
        changes.push(`مبلغ قرارداد: ${Number(val).toLocaleString("fa-IR")} تومان`);
      }
      updateData.totalContractValue = val;
    }

    if (input.shootingBrief !== undefined) updateData.shootingBrief = input.shootingBrief?.trim() || null;
    if (input.notes !== undefined) updateData.notes = input.notes?.trim() || null;

    const [updated] = await tx
      .update(studioProjects)
      .set(updateData)
      .where(eq(studioProjects.id, id))
      .returning();

    if (changes.length > 0) {
      await logProjectTimeline(
        id,
        {
          actionType: "PROJECT_UPDATED",
          title: "ویرایش مشخصات پروژه",
          description: `تغییرات اعمال‌شده:\n• ${changes.join("\n• ")}`,
          authorName: input.authorName || "مدیر استودیو",
          metadata: { changes },
        },
        tx
      );
    }

    return updated;
  });
}

export async function updateStudioProjectStatus(id: string, newStatus: string, authorName: string = "مدیر استودیو") {
  return updateStudioProjectStage(id, newStatus, undefined, authorName);
}

// ==========================================
// CONTRACTS MANAGEMENT
// ==========================================

export async function createStudioContract(projectId: string, input: CreateContractInput) {
  assertUuid(projectId);

  const total = Number(decimal(input.totalAmount, "مبلغ قرارداد", 2, true));
  const deposit = input.depositAmount ? Number(decimal(input.depositAmount, "مبلغ بیعانه", 2)) : 0;

  if (deposit > total) {
    throw new ApiError(400, "مبلغ بیعانه نمی‌تواند از مبلغ کل قرارداد بیشتر باشد.");
  }

  const installments = Math.max(1, Number(input.installmentsCount || 1));
  const contractDate = input.contractDate ? new Date(input.contractDate) : new Date();
  const deliveryDate = input.deliveryCommitmentDate ? new Date(input.deliveryCommitmentDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const contractNumber = await getNextSequenceCode("studio_contract");
  const contractStatus = input.status || "signed";

  return db.transaction(async (tx) => {
    const [project] = await tx
      .select()
      .from(studioProjects)
      .where(eq(studioProjects.id, projectId))
      .limit(1);

    if (!project) throw new ApiError(404, "پروژه یافت نشد.");

    const [contract] = await tx
      .insert(studioContracts)
      .values({
        contractNumber,
        studioProjectId: projectId,
        totalAmount: total.toFixed(2),
        depositAmount: deposit.toFixed(2),
        installmentsCount: installments,
        contractDate,
        deliveryCommitmentDate: deliveryDate,
        termsAndConditions: input.termsAndConditions?.trim() || null,
        signedDocumentUrl: input.signedDocumentUrl?.trim() || null,
        status: contractStatus,
      })
      .returning();

    // If deposit was paid upfront, create a payment record
    if (deposit > 0) {
      await tx.insert(studioProjectPayments).values({
        studioProjectId: projectId,
        amount: deposit.toFixed(2),
        paymentType: "deposit",
        paymentMethod: "card_transfer",
        paidAt: contractDate,
        status: "received",
        notes: `پیش‌پرداخت قرارداد شماره ${contractNumber}`,
      });
    }

    // Advance project status if it was in lead/contact/proposal
    const newStatus = ["lead", "contact", "proposal"].includes(project.status)
      ? "contract"
      : project.status;

    await tx
      .update(studioProjects)
      .set({
        totalContractValue: total.toFixed(2),
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(studioProjects.id, projectId));

    // Log to Timeline
    await logProjectTimeline(
      projectId,
      {
        actionType: "CONTRACT_CREATED",
        title: `تنظیم قرارداد رسمی شماره ${contractNumber}`,
        description: `قرارداد به ارزش ${total.toLocaleString("fa-IR")} تومان و بیعانه ${deposit.toLocaleString("fa-IR")} تومان ثبت و منعقد گردید.`,
        authorName: input.authorName || "مدیر استودیو",
        metadata: {
          contractNumber,
          totalAmount: total,
          depositAmount: deposit,
          status: contractStatus,
        },
      },
      tx
    );

    return {
      ...contract,
      remainingBalance: (total - deposit).toFixed(2),
    };
  });
}

export async function updateStudioContract(contractId: string, input: UpdateContractInput) {
  assertUuid(contractId);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(studioContracts)
      .where(eq(studioContracts.id, contractId))
      .limit(1);

    if (!existing) throw new ApiError(404, "قرارداد یافت نشد.");

    const updateData: Partial<typeof studioContracts.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (input.totalAmount !== undefined) {
      updateData.totalAmount = decimal(input.totalAmount, "مبلغ قرارداد", 2);
    }
    if (input.depositAmount !== undefined) {
      updateData.depositAmount = decimal(input.depositAmount || 0, "مبلغ بیعانه", 2);
    }
    if (input.installmentsCount !== undefined) {
      updateData.installmentsCount = Math.max(1, Number(input.installmentsCount));
    }
    if (input.contractDate) {
      updateData.contractDate = new Date(input.contractDate);
    }
    if (input.deliveryCommitmentDate) {
      updateData.deliveryCommitmentDate = new Date(input.deliveryCommitmentDate);
    }
    if (input.termsAndConditions !== undefined) {
      updateData.termsAndConditions = input.termsAndConditions?.trim() || null;
    }
    if (input.signedDocumentUrl !== undefined) {
      updateData.signedDocumentUrl = input.signedDocumentUrl?.trim() || null;
    }
    if (input.status !== undefined) {
      updateData.status = input.status;
    }

    const [updated] = await tx
      .update(studioContracts)
      .set(updateData)
      .where(eq(studioContracts.id, contractId))
      .returning();

    // Log to Timeline
    await logProjectTimeline(
      existing.studioProjectId,
      {
        actionType: "CONTRACT_UPDATED",
        title: `به‌روزرسانی قرارداد شماره ${existing.contractNumber}`,
        description: `وضعیت قرارداد: ${updated.status} - مبلغ: ${Number(updated.totalAmount).toLocaleString("fa-IR")} تومان`,
        authorName: input.authorName || "مدیر استودیو",
        metadata: {
          contractNumber: existing.contractNumber,
          status: updated.status,
        },
      },
      tx
    );

    return updated;
  });
}

// ==========================================
// PAYMENTS MANAGEMENT
// ==========================================

export async function listProjectPayments(projectId: string) {
  assertUuid(projectId);
  return db
    .select()
    .from(studioProjectPayments)
    .where(eq(studioProjectPayments.studioProjectId, projectId))
    .orderBy(desc(studioProjectPayments.paidAt));
}

export async function createStudioPayment(projectId: string, input: CreatePaymentInput) {
  assertUuid(projectId);
  const amount = Number(decimal(input.amount, "مبلغ دریافتی", 2, true));
  const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();

  return db.transaction(async (tx) => {
    const [project] = await tx
      .select({ id: studioProjects.id, title: studioProjects.title })
      .from(studioProjects)
      .where(eq(studioProjects.id, projectId))
      .limit(1);

    if (!project) throw new ApiError(404, "پروژه یافت نشد.");

    const [payment] = await tx
      .insert(studioProjectPayments)
      .values({
        studioProjectId: projectId,
        amount: amount.toFixed(2),
        paymentType: input.paymentType || "installment_1",
        paymentMethod: input.paymentMethod || "card_transfer",
        referenceCode: input.referenceCode?.trim() || null,
        paidAt,
        status: input.status || "received",
        notes: input.notes?.trim() || null,
      })
      .returning();

    // Log to Timeline
    const typeLabel = input.paymentType === "deposit"
      ? "پیش‌پرداخت"
      : input.paymentType === "settlement"
      ? "تسویه حساب نهایی"
      : "قسط دریافتی";

    await logProjectTimeline(
      projectId,
      {
        actionType: "PAYMENT_RECORDED",
        title: `ثبت ${typeLabel} به مبلغ ${amount.toLocaleString("fa-IR")} تومان`,
        description: `روش پرداخت: ${input.paymentMethod || "کارت به کارت"} ${input.referenceCode ? `(پیگیری: ${input.referenceCode})` : ""}`,
        authorName: input.authorName || "حسابداری استودیو",
        metadata: {
          paymentId: payment.id,
          amount,
          paymentType: payment.paymentType,
          paymentMethod: payment.paymentMethod,
        },
      },
      tx
    );

    return payment;
  });
}

export async function deleteStudioPayment(paymentId: string) {
  assertUuid(paymentId);

  return db.transaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(studioProjectPayments)
      .where(eq(studioProjectPayments.id, paymentId))
      .limit(1);

    if (!payment) throw new ApiError(404, "پرداختی یافت نشد.");

    await tx.delete(studioProjectPayments).where(eq(studioProjectPayments.id, paymentId));

    await logProjectTimeline(
      payment.studioProjectId,
      {
        actionType: "PAYMENT_DELETED",
        title: `حذف رکورد پرداختی به مبلغ ${Number(payment.amount).toLocaleString("fa-IR")} تومان`,
        description: `رسید پرداخت مربوط به تاریخ ${payment.paidAt.toLocaleDateString("fa-IR")} حذف گردید.`,
        authorName: "حسابداری استودیو",
        metadata: { paymentId },
      },
      tx
    );

    return { success: true, message: "پرداختی با موفقیت حذف شد." };
  });
}

// ==========================================
// EXPENSES MANAGEMENT
// ==========================================

export async function listProjectExpenses(projectId: string) {
  assertUuid(projectId);
  return db
    .select()
    .from(studioProjectExpenses)
    .where(eq(studioProjectExpenses.studioProjectId, projectId))
    .orderBy(desc(studioProjectExpenses.paidAt));
}

export async function createStudioExpense(projectId: string, input: CreateExpenseInput) {
  assertUuid(projectId);
  if (!input.title || !input.title.trim()) {
    throw new ApiError(400, "عنوان هزینه الزامی است.");
  }
  const amount = Number(decimal(input.amount, "مبلغ هزینه", 2, true));
  const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();

  return db.transaction(async (tx) => {
    const [project] = await tx
      .select({ id: studioProjects.id, title: studioProjects.title })
      .from(studioProjects)
      .where(eq(studioProjects.id, projectId))
      .limit(1);

    if (!project) throw new ApiError(404, "پروژه یافت نشد.");

    const [expense] = await tx
      .insert(studioProjectExpenses)
      .values({
        studioProjectId: projectId,
        expenseCategory: input.expenseCategory || "personnel",
        title: input.title.trim(),
        amount: amount.toFixed(2),
        recipientName: input.recipientName?.trim() || null,
        paidAt,
        paymentStatus: input.paymentStatus || "paid",
        notes: input.notes?.trim() || null,
      })
      .returning();

    // Log to Timeline
    await logProjectTimeline(
      projectId,
      {
        actionType: "EXPENSE_RECORDED",
        title: `ثبت هزینه «${expense.title}»`,
        description: `مبلغ: ${amount.toLocaleString("fa-IR")} تومان ${expense.recipientName ? `- دریافت‌کننده: ${expense.recipientName}` : ""}`,
        authorName: input.authorName || "مدیر استودیو",
        metadata: {
          expenseId: expense.id,
          category: expense.expenseCategory,
          amount,
        },
      },
      tx
    );

    return expense;
  });
}

export async function deleteStudioExpense(expenseId: string) {
  assertUuid(expenseId);

  return db.transaction(async (tx) => {
    const [expense] = await tx
      .select()
      .from(studioProjectExpenses)
      .where(eq(studioProjectExpenses.id, expenseId))
      .limit(1);

    if (!expense) throw new ApiError(404, "هزینه یافت نشد.");

    await tx.delete(studioProjectExpenses).where(eq(studioProjectExpenses.id, expenseId));

    await logProjectTimeline(
      expense.studioProjectId,
      {
        actionType: "EXPENSE_DELETED",
        title: `حذف هزینه «${expense.title}»`,
        description: `هزینه به مبلغ ${Number(expense.amount).toLocaleString("fa-IR")} تومان حذف گردید.`,
        authorName: "مدیر استودیو",
        metadata: { expenseId },
      },
      tx
    );

    return { success: true, message: "هزینه با موفقیت حذف شد." };
  });
}

// ==========================================
// PERSONNEL & RENTAL ASSIGNMENTS
// ==========================================

export async function assignPersonnelToProject(projectId: string, input: AssignPersonnelInput) {
  assertUuid(projectId);
  assertUuid(input.personnelId);

  const [project] = await db.select({ id: studioProjects.id }).from(studioProjects).where(eq(studioProjects.id, projectId)).limit(1);
  if (!project) throw new ApiError(404, "پروژه یافت نشد.");

  const [personnel] = await db.select({ id: studioPersonnel.id, fullName: studioPersonnel.fullName, primaryRole: studioPersonnel.primaryRole }).from(studioPersonnel).where(eq(studioPersonnel.id, input.personnelId)).limit(1);
  if (!personnel) throw new ApiError(404, "عوامل یا پرسنل یافت نشد.");

  const rate = Number(decimal(input.rateAmount, "نرخ دستمزد", 2, true));
  const units = Number(decimal(input.unitsCount ?? 1, "تعداد واحد یا ساعت", 2, true));
  const total = (rate * units).toFixed(2);

  return db.transaction(async (tx) => {
    const [record] = await tx
      .insert(personnelSalaryRecords)
      .values({
        personnelId: input.personnelId,
        studioProjectId: projectId,
        salaryType: input.salaryType || "per_project",
        rateAmount: rate.toFixed(2),
        unitsCount: units.toFixed(2),
        totalCalculated: total,
        paymentStatus: "pending",
        notes: input.notes?.trim() || null,
      })
      .returning();

    await logProjectTimeline(
      projectId,
      {
        actionType: "PERSONNEL_ASSIGNED",
        title: `تخصیص عامل اجرایی: ${personnel.fullName}`,
        description: `نقش: ${personnel.primaryRole} - دستمزد مصوب: ${Number(total).toLocaleString("fa-IR")} تومان`,
        authorName: input.authorName || "مدیر تولید استودیو",
        metadata: { personnelId: personnel.id, salaryRecordId: record.id, totalCalculated: total },
      },
      tx
    );

    return record;
  });
}

export async function addRentalToProject(projectId: string, input: AddRentalInput) {
  assertUuid(projectId);
  if (!input.itemTitle || !input.itemTitle.trim()) {
    throw new ApiError(400, "عنوان تجهیز کرایه‌ای الزامی است.");
  }

  const [project] = await db.select({ id: studioProjects.id }).from(studioProjects).where(eq(studioProjects.id, projectId)).limit(1);
  if (!project) throw new ApiError(404, "پروژه یافت نشد.");

  if (input.supplierId) {
    assertUuid(input.supplierId);
    const [sup] = await db.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.id, input.supplierId)).limit(1);
    if (!sup) throw new ApiError(404, "تأمین‌کننده یافت نشد.");
  }

  const cost = decimal(input.rentalCost, "هزینه کرایه", 2);
  const deposit = input.depositGuarantee !== undefined && input.depositGuarantee !== null
    ? String(input.depositGuarantee)
    : "0.00";

  const pickup = new Date(input.pickupDate);
  const returnD = new Date(input.returnDate);

  if (isNaN(pickup.getTime()) || isNaN(returnD.getTime())) {
    throw new ApiError(400, "تاریخ تحویل و بازگشت نامعتبر است.");
  }

  if (pickup > returnD) {
    throw new ApiError(400, "تاریخ بازگشت باید بعد از تاریخ تحویل باشد.");
  }

  return db.transaction(async (tx) => {
    const [rental] = await tx
      .insert(rentalEquipment)
      .values({
        studioProjectId: projectId,
        supplierId: input.supplierId || null,
        itemTitle: input.itemTitle.trim(),
        rentalCompany: input.rentalCompany?.trim() || "تأمین‌کننده کرایه تجهیزات",
        rentalCost: cost,
        depositGuarantee: deposit,
        pickupDate: pickup,
        returnDate: returnD,
        notes: input.notes?.trim() || null,
      })
      .returning();

    await logProjectTimeline(
      projectId,
      {
        actionType: "RENTAL_ADDED",
        title: `کرایه تجهیز خارجی: ${rental.itemTitle}`,
        description: `هزینه کرایه: ${Number(cost).toLocaleString("fa-IR")} تومان - شرکت: ${rental.rentalCompany}`,
        authorName: input.authorName || "مدیر فنی",
        metadata: { rentalId: rental.id, cost },
      },
      tx
    );

    return rental;
  });
}

export async function reserveEquipmentForProject(projectId: string, input: ReserveEquipmentForProjectInput) {
  assertUuid(projectId);
  assertUuid(input.equipmentId);
  if (input.assignedPersonnelId) assertUuid(input.assignedPersonnelId);

  const from = new Date(input.reservedFrom);
  const to = new Date(input.reservedTo);

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    throw new ApiError(400, "بازه زمانی رزرو نامعتبر است.");
  }

  if (from >= to) {
    throw new ApiError(400, "تاریخ پایان رزرو باید بعد از شروع باشد.");
  }

  // Conflict check
  await checkEquipmentAvailability(input.equipmentId, from, to);

  return db.transaction(async (tx) => {
    const [equipment] = await tx.select({ id: studioEquipment.id, title: studioEquipment.title, code: studioEquipment.code }).from(studioEquipment).where(eq(studioEquipment.id, input.equipmentId)).limit(1);

    const [reservation] = await tx
      .insert(equipmentReservations)
      .values({
        equipmentId: input.equipmentId,
        studioProjectId: projectId,
        assignedPersonnelId: input.assignedPersonnelId || null,
        reservedFrom: from,
        reservedTo: to,
        status: "reserved",
        notes: input.notes?.trim() || null,
      })
      .returning();

    await logProjectTimeline(
      projectId,
      {
        actionType: "EQUIPMENT_RESERVED",
        title: `رزرو تجهیز آتلیه: ${equipment?.title || "تجهیز"} (${equipment?.code || ""})`,
        description: `بازه رزرو: از ${from.toLocaleDateString("fa-IR")} تا ${to.toLocaleDateString("fa-IR")}`,
        authorName: input.authorName || "انباردار فنی",
        metadata: { reservationId: reservation.id, equipmentId: input.equipmentId },
      },
      tx
    );

    return reservation;
  });
}
