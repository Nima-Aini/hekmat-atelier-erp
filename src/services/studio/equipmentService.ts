import { db } from "@/db";
import {
  studioEquipment,
  equipmentReservations,
  studioProjects,
  studioPersonnel,
  rentalEquipment,
  suppliers,
  expenses,
} from "@/db/schema";
import { and, desc, eq, ilike, ne, or, sql } from "drizzle-orm";
import { ApiError, assertUuid, decimal, pageNumber } from "@/lib/apiError";
import { getNextSequenceCode } from "@/services/sequence";

export type EquipmentMasterStatus = "available" | "reserved" | "project" | "repair";

export function computeEquipmentStatus(
  locationType: string,
  healthStatus: string
): EquipmentMasterStatus {
  if (
    locationType === "maintenance" ||
    healthStatus === "needs_service" ||
    healthStatus === "damaged"
  ) {
    return "repair";
  }
  if (locationType === "on_set") {
    return "project";
  }
  if (locationType === "reserved") {
    return "reserved";
  }
  return "available";
}

export interface CreateEquipmentInput {
  code?: string;
  title: string;
  category: string;
  brand?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  purchaseDate?: Date | string | null;
  purchaseCost?: number | string | null;
  currentHealthStatus?: "healthy" | "needs_service" | "damaged" | "retired";
  requiresInsurance?: boolean;
  locationType?: "in_studio" | "reserved" | "on_set" | "maintenance";
  status?: EquipmentMasterStatus;
  notes?: string | null;
}

export interface UpdateEquipmentInput {
  title?: string;
  category?: string;
  brand?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  purchaseDate?: Date | string | null;
  purchaseCost?: number | string | null;
  currentHealthStatus?: "healthy" | "needs_service" | "damaged" | "retired";
  requiresInsurance?: boolean;
  locationType?: "in_studio" | "reserved" | "on_set" | "maintenance";
  status?: EquipmentMasterStatus;
  notes?: string | null;
}

export interface ListEquipmentFilter {
  search?: string;
  category?: string;
  healthStatus?: string;
  locationType?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface ReserveEquipmentInput {
  equipmentId: string;
  studioProjectId?: string | null;
  assignedPersonnelId?: string | null;
  reservedFrom: Date | string;
  reservedTo: Date | string;
  notes?: string | null;
}

export const VALID_EQUIPMENT_CATEGORIES = [
  "camera",
  "lens",
  "light",
  "lighting",
  "audio",
  "sound_mic",
  "drone",
  "studio",
  "gimbal_stabilizer",
  "backdrop_props",
  "crane_jib",
  "battery_power",
  "tripod_support",
  "accessory",
  "general",
] as const;

export async function listStudioEquipment(filter: ListEquipmentFilter) {
  const page = pageNumber(filter.page ? String(filter.page) : null, 1);
  const pageSize = pageNumber(filter.pageSize ? String(filter.pageSize) : null, 20, 100);
  const offset = (page - 1) * pageSize;

  const conditions = [];

  if (filter.category && filter.category !== "all") {
    if (filter.category === "light" || filter.category === "lighting") {
      conditions.push(or(eq(studioEquipment.category, "light"), eq(studioEquipment.category, "lighting"))!);
    } else if (filter.category === "audio" || filter.category === "sound_mic") {
      conditions.push(or(eq(studioEquipment.category, "audio"), eq(studioEquipment.category, "sound_mic"))!);
    } else if (filter.category === "studio" || filter.category === "accessory") {
      conditions.push(or(eq(studioEquipment.category, "studio"), eq(studioEquipment.category, "accessory"))!);
    } else {
      conditions.push(eq(studioEquipment.category, filter.category));
    }
  }

  if (filter.status && filter.status !== "all") {
    if (filter.status === "available") {
      conditions.push(
        and(
          eq(studioEquipment.locationType, "in_studio"),
          eq(studioEquipment.currentHealthStatus, "healthy")
        )!
      );
    } else if (filter.status === "reserved") {
      conditions.push(eq(studioEquipment.locationType, "reserved"));
    } else if (filter.status === "project") {
      conditions.push(eq(studioEquipment.locationType, "on_set"));
    } else if (filter.status === "repair") {
      conditions.push(
        or(
          eq(studioEquipment.locationType, "maintenance"),
          eq(studioEquipment.currentHealthStatus, "needs_service"),
          eq(studioEquipment.currentHealthStatus, "damaged")
        )!
      );
    }
  }

  if (filter.healthStatus && filter.healthStatus !== "all") {
    conditions.push(eq(studioEquipment.currentHealthStatus, filter.healthStatus));
  }

  if (filter.locationType && filter.locationType !== "all") {
    conditions.push(eq(studioEquipment.locationType, filter.locationType));
  }

  if (filter.search && filter.search.trim()) {
    const pattern = `%${filter.search.trim()}%`;
    conditions.push(
      or(
        ilike(studioEquipment.title, pattern),
        ilike(studioEquipment.code, pattern),
        ilike(studioEquipment.brand, pattern),
        ilike(studioEquipment.model, pattern),
        ilike(studioEquipment.serialNumber, pattern)
      )!
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(studioEquipment)
    .where(whereClause);

  const total = countResult?.total || 0;

  const list = await db
    .select()
    .from(studioEquipment)
    .where(whereClause)
    .orderBy(desc(studioEquipment.createdAt))
    .limit(pageSize)
    .offset(offset);

  const formatted = list.map((item) => ({
    ...item,
    status: computeEquipmentStatus(item.locationType, item.currentHealthStatus),
  }));

  return {
    equipment: formatted,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

export async function getStudioEquipmentById(id: string) {
  assertUuid(id);

  const [equipment] = await db
    .select()
    .from(studioEquipment)
    .where(eq(studioEquipment.id, id))
    .limit(1);

  if (!equipment) {
    throw new ApiError(404, "تجهیز موردنظر یافت نشد.");
  }

  // Active or recent reservations
  const reservations = await db
    .select({
      id: equipmentReservations.id,
      equipmentId: equipmentReservations.equipmentId,
      studioProjectId: equipmentReservations.studioProjectId,
      assignedPersonnelId: equipmentReservations.assignedPersonnelId,
      reservedFrom: equipmentReservations.reservedFrom,
      reservedTo: equipmentReservations.reservedTo,
      status: equipmentReservations.status,
      checkoutTime: equipmentReservations.checkoutTime,
      checkinTime: equipmentReservations.checkinTime,
      notes: equipmentReservations.notes,
      projectTitle: studioProjects.title,
      projectNumber: studioProjects.projectNumber,
      personnelName: studioPersonnel.fullName,
    })
    .from(equipmentReservations)
    .leftJoin(studioProjects, eq(equipmentReservations.studioProjectId, studioProjects.id))
    .leftJoin(studioPersonnel, eq(equipmentReservations.assignedPersonnelId, studioPersonnel.id))
    .where(eq(equipmentReservations.equipmentId, id))
    .orderBy(desc(equipmentReservations.reservedFrom))
    .limit(20);

  return {
    ...equipment,
    status: computeEquipmentStatus(equipment.locationType, equipment.currentHealthStatus),
    reservations,
  };
}

export async function createStudioEquipment(input: CreateEquipmentInput) {
  if (!input.title || !input.title.trim()) {
    throw new ApiError(400, "عنوان یا مدل تجهیز الزامی است.");
  }
  if (!input.category || !input.category.trim()) {
    throw new ApiError(400, "دسته‌بندی تجهیز الزامی است.");
  }

  let code = input.code?.trim();
  if (!code) {
    code = await getNextSequenceCode("studio_equipment");
  }

  const cost = input.purchaseCost !== undefined && input.purchaseCost !== null
    ? decimal(input.purchaseCost, "هزینه خرید", 2)
    : "0.00";

  const purchaseDate = input.purchaseDate ? new Date(input.purchaseDate) : null;

  let locationType = input.locationType || "in_studio";
  let currentHealthStatus = input.currentHealthStatus || "healthy";

  if (input.status) {
    if (input.status === "available") {
      locationType = "in_studio";
      currentHealthStatus = "healthy";
    } else if (input.status === "reserved") {
      locationType = "reserved";
    } else if (input.status === "project") {
      locationType = "on_set";
    } else if (input.status === "repair") {
      locationType = "maintenance";
      currentHealthStatus = "needs_service";
    }
  }

  const [equipment] = await db
    .insert(studioEquipment)
    .values({
      code,
      title: input.title.trim(),
      category: input.category.trim(),
      brand: input.brand?.trim() || null,
      model: input.model?.trim() || null,
      serialNumber: input.serialNumber?.trim() || null,
      purchaseDate,
      purchaseCost: cost,
      currentHealthStatus,
      requiresInsurance: Boolean(input.requiresInsurance),
      locationType,
      notes: input.notes?.trim() || null,
    })
    .returning();

  return {
    ...equipment,
    status: computeEquipmentStatus(equipment.locationType, equipment.currentHealthStatus),
  };
}

export async function updateStudioEquipment(id: string, input: UpdateEquipmentInput) {
  assertUuid(id);

  const [existing] = await db.select().from(studioEquipment).where(eq(studioEquipment.id, id)).limit(1);
  if (!existing) {
    throw new ApiError(404, "تجهیز موردنظر یافت نشد.");
  }

  const updateData: Partial<typeof studioEquipment.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.title !== undefined) {
    if (!input.title.trim()) throw new ApiError(400, "عنوان تجهیز نباید خالی باشد.");
    updateData.title = input.title.trim();
  }

  if (input.category !== undefined) {
    if (!input.category.trim()) throw new ApiError(400, "دسته‌بندی تجهیز نباید خالی باشد.");
    updateData.category = input.category.trim();
  }

  if (input.brand !== undefined) updateData.brand = input.brand?.trim() || null;
  if (input.model !== undefined) updateData.model = input.model?.trim() || null;
  if (input.serialNumber !== undefined) updateData.serialNumber = input.serialNumber?.trim() || null;

  if (input.purchaseDate !== undefined) {
    updateData.purchaseDate = input.purchaseDate ? new Date(input.purchaseDate) : null;
  }

  if (input.purchaseCost !== undefined) {
    updateData.purchaseCost = input.purchaseCost !== null ? decimal(input.purchaseCost, "هزینه خرید", 2) : "0.00";
  }

  if (input.status) {
    if (input.status === "available") {
      updateData.locationType = "in_studio";
      updateData.currentHealthStatus = "healthy";
    } else if (input.status === "reserved") {
      updateData.locationType = "reserved";
    } else if (input.status === "project") {
      updateData.locationType = "on_set";
    } else if (input.status === "repair") {
      updateData.locationType = "maintenance";
      updateData.currentHealthStatus = "needs_service";
    }
  }

  if (input.currentHealthStatus !== undefined && !input.status) {
    if (!["healthy", "needs_service", "damaged", "retired"].includes(input.currentHealthStatus)) {
      throw new ApiError(400, "وضعیت سلامت تجهیز نامعتبر است.");
    }
    updateData.currentHealthStatus = input.currentHealthStatus;
  }

  if (input.requiresInsurance !== undefined) {
    updateData.requiresInsurance = Boolean(input.requiresInsurance);
  }

  if (input.locationType !== undefined && !input.status) {
    if (!["in_studio", "reserved", "on_set", "maintenance"].includes(input.locationType)) {
      throw new ApiError(400, "وضعیت استقرار تجهیز نامعتبر است.");
    }
    updateData.locationType = input.locationType;
  }

  if (input.notes !== undefined) {
    updateData.notes = input.notes?.trim() || null;
  }

  const [updated] = await db
    .update(studioEquipment)
    .set(updateData)
    .where(eq(studioEquipment.id, id))
    .returning();

  return {
    ...updated,
    status: computeEquipmentStatus(updated.locationType, updated.currentHealthStatus),
  };
}

/**
 * Logical delete (retire equipment) or physical delete if no historical reservations exist
 */
export async function deleteOrRetireEquipment(id: string) {
  assertUuid(id);

  return db.transaction(async (tx) => {
    const [equipment] = await tx.select().from(studioEquipment).where(eq(studioEquipment.id, id)).limit(1);
    if (!equipment) {
      throw new ApiError(404, "تجهیز موردنظر یافت نشد.");
    }

    const [resCount] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(equipmentReservations)
      .where(eq(equipmentReservations.equipmentId, id));

    if ((resCount?.count || 0) > 0) {
      // Logical delete: set status to retired
      await tx
        .update(studioEquipment)
        .set({
          currentHealthStatus: "retired",
          locationType: "maintenance",
          updatedAt: new Date(),
        })
        .where(eq(studioEquipment.id, id));

      return {
        success: true,
        archived: true,
        message: `تجهیز «${equipment.title}» به دلیل داشتن سابقه رزرو، اسقاط/بایگانی شد و سوابق آن حفظ شد.`,
      };
    } else {
      await tx.delete(studioEquipment).where(eq(studioEquipment.id, id));
      return {
        success: true,
        archived: false,
        message: `تجهیز «${equipment.title}» با موفقیت حذف شد.`,
      };
    }
  });
}

/**
 * Checks if the equipment is available during the requested interval [from, to].
 * Throws ApiError(409) if an active overlapping reservation exists.
 */
export async function checkEquipmentAvailability(
  equipmentId: string,
  from: Date,
  to: Date,
  excludeReservationId?: string,
  client: any = db
) {
  assertUuid(equipmentId);

  // Overlap condition: startA < endB AND endA > startB
  const conditions = [
    eq(equipmentReservations.equipmentId, equipmentId),
    ne(equipmentReservations.status, "cancelled"),
    ne(equipmentReservations.status, "returned"),
    sql`${equipmentReservations.reservedFrom} < ${to}`,
    sql`${equipmentReservations.reservedTo} > ${from}`,
  ];

  if (excludeReservationId) {
    conditions.push(ne(equipmentReservations.id, excludeReservationId));
  }

  const conflicting = await client
    .select({
      id: equipmentReservations.id,
      reservedFrom: equipmentReservations.reservedFrom,
      reservedTo: equipmentReservations.reservedTo,
      status: equipmentReservations.status,
      projectTitle: studioProjects.title,
    })
    .from(equipmentReservations)
    .leftJoin(studioProjects, eq(equipmentReservations.studioProjectId, studioProjects.id))
    .where(and(...conditions))
    .limit(1);

  if (conflicting.length > 0) {
    const conflict = conflicting[0];
    const fromStr = new Date(conflict.reservedFrom).toLocaleDateString("fa-IR");
    const toStr = new Date(conflict.reservedTo).toLocaleDateString("fa-IR");
    throw new ApiError(
      409,
      `تداخل زمانی! این تجهیز در بازه ${fromStr} تا ${toStr} برای پروژه «${conflict.projectTitle || "دیگر"}» رزرو است.`
    );
  }

  return true;
}

export async function reserveStudioEquipment(input: ReserveEquipmentInput) {
  assertUuid(input.equipmentId);
  if (input.studioProjectId) assertUuid(input.studioProjectId);
  if (input.assignedPersonnelId) assertUuid(input.assignedPersonnelId);

  const from = new Date(input.reservedFrom);
  const to = new Date(input.reservedTo);

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    throw new ApiError(400, "تاریخ شروع و پایان رزرو معتبر نیست.");
  }

  if (from >= to) {
    throw new ApiError(400, "تاریخ پایان رزرو باید بعد از تاریخ شروع باشد.");
  }

  return db.transaction(async (tx) => {
    // 1. Verify equipment exists and is not retired
    const [equipment] = await tx
      .select()
      .from(studioEquipment)
      .where(eq(studioEquipment.id, input.equipmentId))
      .limit(1);

    if (!equipment) throw new ApiError(404, "تجهیز یافت نشد.");
    if (equipment.currentHealthStatus === "retired") {
      throw new ApiError(400, "امکان رزرو تجهیز بازنشسته یا اسقاط‌شده وجود ندارد.");
    }

    // 2. Conflict prevention: check overlap
    await checkEquipmentAvailability(input.equipmentId, from, to, undefined, tx);

    // 3. Create reservation
    const [reservation] = await tx
      .insert(equipmentReservations)
      .values({
        equipmentId: input.equipmentId,
        studioProjectId: input.studioProjectId || null,
        assignedPersonnelId: input.assignedPersonnelId || null,
        reservedFrom: from,
        reservedTo: to,
        status: "reserved",
        notes: input.notes?.trim() || null,
      })
      .returning();

    // 4. Update equipment location if reservation starts immediately
    const now = new Date();
    if (from <= now && to >= now) {
      await tx
        .update(studioEquipment)
        .set({ locationType: "reserved", updatedAt: new Date() })
        .where(eq(studioEquipment.id, input.equipmentId));
    }

    return reservation;
  });
}

export async function updateReservationStatus(
  reservationId: string,
  action: "checkout" | "checkin" | "cancel" | "confirm"
) {
  assertUuid(reservationId);

  return db.transaction(async (tx) => {
    const [reservation] = await tx
      .select()
      .from(equipmentReservations)
      .where(eq(equipmentReservations.id, reservationId))
      .limit(1);

    if (!reservation) throw new ApiError(404, "رزرو موردنظر یافت نشد.");

    const now = new Date();
    const updateData: Partial<typeof equipmentReservations.$inferInsert> = {};
    const equipUpdate: Partial<typeof studioEquipment.$inferInsert> = {};

    switch (action) {
      case "checkout":
        updateData.status = "checked_out";
        updateData.checkoutTime = now;
        equipUpdate.locationType = "on_set";
        break;
      case "checkin":
        updateData.status = "returned";
        updateData.checkinTime = now;
        equipUpdate.locationType = "in_studio";
        break;
      case "cancel":
        updateData.status = "cancelled";
        equipUpdate.locationType = "in_studio";
        break;
      case "confirm":
        updateData.status = "reserved";
        equipUpdate.locationType = "reserved";
        break;
    }

    const [updated] = await tx
      .update(equipmentReservations)
      .set(updateData)
      .where(eq(equipmentReservations.id, reservationId))
      .returning();

    if (Object.keys(equipUpdate).length > 0) {
      await tx
        .update(studioEquipment)
        .set({ ...equipUpdate, updatedAt: now })
        .where(eq(studioEquipment.id, reservation.equipmentId));
    }

    return updated;
  });
}

// ==========================================
// RENTAL EQUIPMENT (تجهیزات اجاره‌ای)
// ==========================================

export interface CreateRentalEquipmentInput {
  itemTitle: string;
  rentalCompany: string;
  rentalCost: number | string;
  depositGuarantee?: string | null;
  pickupDate: Date | string;
  returnDate: Date | string;
  studioProjectId?: string | null;
  supplierId?: string | null;
  status?: "planned" | "rented" | "returned" | "settled";
  notes?: string | null;
}

export interface UpdateRentalEquipmentInput {
  itemTitle?: string;
  rentalCompany?: string;
  rentalCost?: number | string;
  depositGuarantee?: string | null;
  pickupDate?: Date | string;
  returnDate?: Date | string;
  studioProjectId?: string | null;
  supplierId?: string | null;
  status?: "planned" | "rented" | "returned" | "settled";
  notes?: string | null;
}

export interface ListRentalFilter {
  search?: string;
  status?: string;
  studioProjectId?: string;
  page?: number;
  pageSize?: number;
}

export async function listRentalEquipment(filter: ListRentalFilter = {}) {
  const page = pageNumber(filter.page ? String(filter.page) : null, 1);
  const pageSize = pageNumber(filter.pageSize ? String(filter.pageSize) : null, 20, 100);
  const offset = (page - 1) * pageSize;

  const conditions = [];

  if (filter.status && filter.status !== "all") {
    conditions.push(eq(rentalEquipment.status, filter.status));
  }

  if (filter.studioProjectId && filter.studioProjectId !== "all") {
    assertUuid(filter.studioProjectId);
    conditions.push(eq(rentalEquipment.studioProjectId, filter.studioProjectId));
  }

  if (filter.search && filter.search.trim()) {
    const pattern = `%${filter.search.trim()}%`;
    conditions.push(
      or(
        ilike(rentalEquipment.itemTitle, pattern),
        ilike(rentalEquipment.rentalCompany, pattern),
        ilike(rentalEquipment.notes, pattern),
        ilike(rentalEquipment.depositGuarantee, pattern)
      )!
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(rentalEquipment)
    .where(whereClause);

  const total = countResult?.total || 0;

  const rentals = await db
    .select({
      id: rentalEquipment.id,
      studioProjectId: rentalEquipment.studioProjectId,
      supplierId: rentalEquipment.supplierId,
      itemTitle: rentalEquipment.itemTitle,
      rentalCompany: rentalEquipment.rentalCompany,
      rentalCost: rentalEquipment.rentalCost,
      depositGuarantee: rentalEquipment.depositGuarantee,
      pickupDate: rentalEquipment.pickupDate,
      returnDate: rentalEquipment.returnDate,
      expenseId: rentalEquipment.expenseId,
      status: rentalEquipment.status,
      notes: rentalEquipment.notes,
      createdAt: rentalEquipment.createdAt,
      updatedAt: rentalEquipment.updatedAt,
      projectTitle: studioProjects.title,
      projectNumber: studioProjects.projectNumber,
      supplierName: suppliers.name,
    })
    .from(rentalEquipment)
    .leftJoin(studioProjects, eq(rentalEquipment.studioProjectId, studioProjects.id))
    .leftJoin(suppliers, eq(rentalEquipment.supplierId, suppliers.id))
    .where(whereClause)
    .orderBy(desc(rentalEquipment.pickupDate))
    .limit(pageSize)
    .offset(offset);

  return {
    rentals,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

export async function getRentalEquipmentById(id: string) {
  assertUuid(id);

  const [rental] = await db
    .select({
      id: rentalEquipment.id,
      studioProjectId: rentalEquipment.studioProjectId,
      supplierId: rentalEquipment.supplierId,
      itemTitle: rentalEquipment.itemTitle,
      rentalCompany: rentalEquipment.rentalCompany,
      rentalCost: rentalEquipment.rentalCost,
      depositGuarantee: rentalEquipment.depositGuarantee,
      pickupDate: rentalEquipment.pickupDate,
      returnDate: rentalEquipment.returnDate,
      expenseId: rentalEquipment.expenseId,
      status: rentalEquipment.status,
      notes: rentalEquipment.notes,
      createdAt: rentalEquipment.createdAt,
      updatedAt: rentalEquipment.updatedAt,
      projectTitle: studioProjects.title,
      projectNumber: studioProjects.projectNumber,
      supplierName: suppliers.name,
    })
    .from(rentalEquipment)
    .leftJoin(studioProjects, eq(rentalEquipment.studioProjectId, studioProjects.id))
    .leftJoin(suppliers, eq(rentalEquipment.supplierId, suppliers.id))
    .where(eq(rentalEquipment.id, id))
    .limit(1);

  if (!rental) {
    throw new ApiError(404, "تجهیز اجاره‌ای یافت نشد.");
  }

  return rental;
}

export async function createRentalEquipment(input: CreateRentalEquipmentInput) {
  if (!input.itemTitle || !input.itemTitle.trim()) {
    throw new ApiError(400, "عنوان تجهیز اجاره‌ای الزامی است.");
  }
  if (!input.rentalCompany || !input.rentalCompany.trim()) {
    throw new ApiError(400, "نام شرکت یا تأمین‌کننده رنتال الزامی است.");
  }

  if (input.studioProjectId) {
    assertUuid(input.studioProjectId);
    const [project] = await db
      .select({ id: studioProjects.id })
      .from(studioProjects)
      .where(eq(studioProjects.id, input.studioProjectId))
      .limit(1);
    if (!project) throw new ApiError(404, "پروژه انتخاب‌شده یافت نشد.");
  }

  if (input.supplierId) {
    assertUuid(input.supplierId);
    const [sup] = await db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(eq(suppliers.id, input.supplierId))
      .limit(1);
    if (!sup) throw new ApiError(404, "تأمین‌کننده انتخاب‌شده یافت نشد.");
  }

  const cost = decimal(input.rentalCost ?? 0, "هزینه کرایه", 2);
  const pickup = new Date(input.pickupDate);
  const returnD = new Date(input.returnDate);

  if (isNaN(pickup.getTime()) || isNaN(returnD.getTime())) {
    throw new ApiError(400, "تاریخ‌های تحویل و بازگشت نامعتبر هستند.");
  }

  if (pickup > returnD) {
    throw new ApiError(400, "تاریخ بازگشت باید بعد از تاریخ تحویل باشد.");
  }

  const [created] = await db
    .insert(rentalEquipment)
    .values({
      studioProjectId: input.studioProjectId || null,
      supplierId: input.supplierId || null,
      itemTitle: input.itemTitle.trim(),
      rentalCompany: input.rentalCompany.trim(),
      rentalCost: cost,
      depositGuarantee: input.depositGuarantee?.trim() || null,
      pickupDate: pickup,
      returnDate: returnD,
      status: input.status || "rented",
      notes: input.notes?.trim() || null,
    })
    .returning();

  return created;
}

export async function updateRentalEquipment(id: string, input: UpdateRentalEquipmentInput) {
  assertUuid(id);

  const [existing] = await db
    .select()
    .from(rentalEquipment)
    .where(eq(rentalEquipment.id, id))
    .limit(1);

  if (!existing) {
    throw new ApiError(404, "تجهیز اجاره‌ای یافت نشد.");
  }

  const updateData: Partial<typeof rentalEquipment.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.itemTitle !== undefined) {
    if (!input.itemTitle.trim()) throw new ApiError(400, "عنوان تجهیز نمی‌تواند خالی باشد.");
    updateData.itemTitle = input.itemTitle.trim();
  }

  if (input.rentalCompany !== undefined) {
    if (!input.rentalCompany.trim()) throw new ApiError(400, "نام شرکت رنتال نمی‌تواند خالی باشد.");
    updateData.rentalCompany = input.rentalCompany.trim();
  }

  if (input.rentalCost !== undefined) {
    updateData.rentalCost = decimal(input.rentalCost, "هزینه کرایه", 2);
  }

  if (input.depositGuarantee !== undefined) {
    updateData.depositGuarantee = input.depositGuarantee?.trim() || null;
  }

  if (input.pickupDate !== undefined) {
    const pickup = new Date(input.pickupDate);
    if (isNaN(pickup.getTime())) throw new ApiError(400, "تاریخ تحویل نامعتبر است.");
    updateData.pickupDate = pickup;
  }

  if (input.returnDate !== undefined) {
    const returnD = new Date(input.returnDate);
    if (isNaN(returnD.getTime())) throw new ApiError(400, "تاریخ بازگشت نامعتبر است.");
    updateData.returnDate = returnD;
  }

  if (input.status !== undefined) {
    if (!["planned", "rented", "returned", "settled"].includes(input.status)) {
      throw new ApiError(400, "وضعیت نامعتبر است.");
    }
    updateData.status = input.status;
  }

  if (input.studioProjectId !== undefined) {
    if (input.studioProjectId) {
      assertUuid(input.studioProjectId);
      updateData.studioProjectId = input.studioProjectId;
    } else {
      updateData.studioProjectId = null;
    }
  }

  if (input.notes !== undefined) {
    updateData.notes = input.notes?.trim() || null;
  }

  const [updated] = await db
    .update(rentalEquipment)
    .set(updateData)
    .where(eq(rentalEquipment.id, id))
    .returning();

  return updated;
}

export async function deleteRentalEquipment(id: string) {
  assertUuid(id);

  const [deleted] = await db
    .delete(rentalEquipment)
    .where(eq(rentalEquipment.id, id))
    .returning();

  if (!deleted) {
    throw new ApiError(404, "تجهیز اجاره‌ای یافت نشد.");
  }

  return { success: true, message: "تجهیز اجاره‌ای با موفقیت حذف گردید." };
}

