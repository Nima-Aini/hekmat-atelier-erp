import crypto from "node:crypto";
import type { Transaction } from "@/services/product";
import { db } from "@/db";
import {
  studioCustomers,
  customers,
  studioProjects,
  studioContracts,
} from "@/db/schema";
import { and, desc, eq, exists, ilike, inArray, or, sql } from "drizzle-orm";
import { ApiError, assertUuid, pageNumber } from "@/lib/apiError";

export interface CreateStudioCustomerInput {
  customerId?: string | null;
  name: string;
  mobile: string;
  phone?: string | null;
  address?: string | null;
  socialMedia?: string | null;
  referrer?: string | null;
  customerType?: "wedding" | "portrait" | "commercial" | "family" | "industrial" | "event" | "child" | "modeling";
  groomName?: string | null;
  brideName?: string | null;
  contactPersonRole?: "groom" | "bride" | "father" | "mother" | "manager" | "self" | "other";
  anniversaryDate?: Date | string | null;
  specialPreferences?: any;
  socialConsent?: boolean;
  vipLevel?: "standard" | "gold" | "platinum" | "vip";
  notes?: string | null;
}

export interface UpdateStudioCustomerInput {
  name?: string;
  mobile?: string;
  phone?: string | null;
  address?: string | null;
  socialMedia?: string | null;
  referrer?: string | null;
  customerType?: "wedding" | "portrait" | "commercial" | "family" | "industrial" | "event" | "child" | "modeling";
  groomName?: string | null;
  brideName?: string | null;
  contactPersonRole?: "groom" | "bride" | "father" | "mother" | "manager" | "self" | "other";
  anniversaryDate?: Date | string | null;
  specialPreferences?: any;
  socialConsent?: boolean;
  vipLevel?: "standard" | "gold" | "platinum" | "vip";
  notes?: string | null;
}

export interface ListStudioCustomerFilter {
  search?: string;
  customerType?: string;
  vipLevel?: string;
  page?: number;
  pageSize?: number;
  allowedCoreProjectIds?: string[] | null;
}

export async function listStudioCustomers(filter: ListStudioCustomerFilter) {
  const page = pageNumber(filter.page ? String(filter.page) : null, 1);
  const pageSize = pageNumber(filter.pageSize ? String(filter.pageSize) : null, 20, 100);
  const offset = (page - 1) * pageSize;

  const conditions = [];
  if (filter.allowedCoreProjectIds !== undefined && filter.allowedCoreProjectIds !== null) {
    conditions.push(filter.allowedCoreProjectIds.length
      ? exists(db.select({ value: sql`1` }).from(studioProjects).where(and(eq(studioProjects.studioCustomerId, studioCustomers.id), inArray(studioProjects.projectId, filter.allowedCoreProjectIds))))
      : sql`false`);
  }

  if (filter.customerType && filter.customerType !== "all") {
    conditions.push(eq(studioCustomers.customerType, filter.customerType));
  }

  if (filter.vipLevel && filter.vipLevel !== "all") {
    conditions.push(eq(studioCustomers.vipLevel, filter.vipLevel));
  }

  if (filter.search && filter.search.trim()) {
    const pattern = `%${filter.search.trim()}%`;
    conditions.push(
      or(
        ilike(customers.name, pattern),
        ilike(customers.mobile, pattern),
        ilike(studioCustomers.groomName, pattern),
        ilike(studioCustomers.brideName, pattern),
        ilike(customers.phone, pattern),
        ilike(studioCustomers.socialMedia, pattern),
        ilike(studioCustomers.referrer, pattern)
      )!
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(studioCustomers)
    .innerJoin(customers, eq(studioCustomers.customerId, customers.id))
    .where(whereClause);

  const total = countRow?.total || 0;

  const list = await db
    .select({
      id: studioCustomers.id,
      customerId: studioCustomers.customerId,
      name: customers.name,
      mobile: customers.mobile,
      phone: customers.phone,
      address: customers.address,
      socialMedia: studioCustomers.socialMedia,
      referrer: studioCustomers.referrer,
      customerType: studioCustomers.customerType,
      groomName: studioCustomers.groomName,
      brideName: studioCustomers.brideName,
      contactPersonRole: studioCustomers.contactPersonRole,
      anniversaryDate: studioCustomers.anniversaryDate,
      specialPreferences: studioCustomers.specialPreferences,
      socialConsent: studioCustomers.socialConsent,
      vipLevel: studioCustomers.vipLevel,
      notes: customers.notes,
      createdAt: studioCustomers.createdAt,
      updatedAt: studioCustomers.updatedAt,
    })
    .from(studioCustomers)
    .innerJoin(customers, eq(studioCustomers.customerId, customers.id))
    .where(whereClause)
    .orderBy(desc(studioCustomers.createdAt))
    .limit(pageSize)
    .offset(offset);

  return {
    customers: list,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

export async function getStudioCustomerById(id: string) {
  assertUuid(id);

  const [studioCust] = await db
    .select({
      id: studioCustomers.id,
      customerId: studioCustomers.customerId,
      customerCode: customers.code,
      name: customers.name,
      mobile: customers.mobile,
      phone: customers.phone,
      address: customers.address,
      socialMedia: studioCustomers.socialMedia,
      referrer: studioCustomers.referrer,
      customerType: studioCustomers.customerType,
      groomName: studioCustomers.groomName,
      brideName: studioCustomers.brideName,
      contactPersonRole: studioCustomers.contactPersonRole,
      anniversaryDate: studioCustomers.anniversaryDate,
      specialPreferences: studioCustomers.specialPreferences,
      socialConsent: studioCustomers.socialConsent,
      vipLevel: studioCustomers.vipLevel,
      notes: customers.notes,
      createdAt: studioCustomers.createdAt,
      updatedAt: studioCustomers.updatedAt,
    })
    .from(studioCustomers)
    .innerJoin(customers, eq(studioCustomers.customerId, customers.id))
    .where(eq(studioCustomers.id, id))
    .limit(1);

  if (!studioCust) {
    throw new ApiError(404, "مشتری آتلیه یافت نشد.");
  }

  // Associated projects
  const projects = await db
    .select({
      id: studioProjects.id,
      projectId: studioProjects.projectId,
      projectNumber: studioProjects.projectNumber,
      title: studioProjects.title,
      eventType: studioProjects.eventType,
      eventDate: studioProjects.eventDate,
      status: studioProjects.status,
      totalContractValue: studioProjects.totalContractValue,
      createdAt: studioProjects.createdAt,
    })
    .from(studioProjects)
    .where(eq(studioProjects.studioCustomerId, id))
    .orderBy(desc(studioProjects.createdAt));

  return {
    ...studioCust,
    projects,
  };
}

export async function createStudioCustomer(input: CreateStudioCustomerInput, transaction?: Transaction, reuseExisting = false) {
  if (!input.name || !input.name.trim()) {
    throw new ApiError(400, "نام مشتری الزامی است.");
  }
  if (!input.mobile || !input.mobile.trim()) {
    throw new ApiError(400, "شماره موبایل الزامی است.");
  }

  const cleanMobile = input.mobile.trim();
  if (!/^09\d{9}$/.test(cleanMobile)) {
    throw new ApiError(400, "فرمت شماره همراه معتبر نیست (مثال: 09121234567).");
  }

  const create = async (tx: Transaction) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"atelier-client:" + cleanMobile}, 0))`);
    let baseCustomerId = input.customerId;

    if (baseCustomerId) {
      assertUuid(baseCustomerId);
      const [existing] = await tx.select({ id: customers.id }).from(customers).where(eq(customers.id, baseCustomerId)).limit(1);
      if (!existing) throw new ApiError(404, "مشتری پایه در سیستم یافت نشد.");
    } else {
      // Check if customer with this mobile exists
      const [existingByMobile] = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.mobile, cleanMobile))
        .limit(1);

      if (existingByMobile) {
        baseCustomerId = existingByMobile.id;
      } else {
        // Create new base customer
        const code = `CL-${crypto.randomUUID()}`;
        const [newCust] = await tx
          .insert(customers)
          .values({
            code,
            name: input.name.trim(),
            mobile: cleanMobile,
            phone: input.phone?.trim() || null,
            address: input.address?.trim() || null,
            notes: input.notes?.trim() || null,
          })
          .returning();
        baseCustomerId = newCust.id;
      }
    }

    // Check if studio customer profile already exists for this customerId
    const [existingStudioCust] = await tx
      .select()
      .from(studioCustomers)
      .where(eq(studioCustomers.customerId, baseCustomerId!))
      .limit(1);

    if (existingStudioCust) {
      if (reuseExisting) return { ...existingStudioCust, name: input.name.trim(), mobile: cleanMobile };
      throw new ApiError(409, "پروفایل آتلیه برای این مشتری قبلاً ایجاد شده است.");
    }

    const annDate = input.anniversaryDate ? new Date(input.anniversaryDate) : null;

    const [created] = await tx
      .insert(studioCustomers)
      .values({
        customerId: baseCustomerId!,
        customerType: input.customerType || "wedding",
        groomName: input.groomName?.trim() || null,
        brideName: input.brideName?.trim() || null,
        contactPersonRole: input.contactPersonRole || "groom",
        anniversaryDate: annDate,
        specialPreferences: input.specialPreferences || {},
        socialConsent: input.socialConsent !== undefined ? Boolean(input.socialConsent) : false,
        socialMedia: input.socialMedia?.trim() || null,
        referrer: input.referrer?.trim() || null,
        notes: input.notes?.trim() || null,
        vipLevel: input.vipLevel || "standard",
      })
      .returning();

    return {
      ...created,
      name: input.name.trim(),
      mobile: cleanMobile,
      socialMedia: input.socialMedia?.trim() || null,
      referrer: input.referrer?.trim() || null,
    };
  };
  return transaction ? create(transaction) : db.transaction(create);
}

export async function updateStudioCustomer(id: string, input: UpdateStudioCustomerInput) {
  assertUuid(id);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: studioCustomers.id,
        customerId: studioCustomers.customerId,
      })
      .from(studioCustomers)
      .where(eq(studioCustomers.id, id))
      .limit(1);

    if (!existing) {
      throw new ApiError(404, "مشتری آتلیه یافت نشد.");
    }

    // Update base customer fields if provided
    const baseCustUpdate: Partial<typeof customers.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (input.name !== undefined) {
      if (!input.name.trim()) throw new ApiError(400, "نام مشتری نباید خالی باشد.");
      baseCustUpdate.name = input.name.trim();
    }

    if (input.mobile !== undefined) {
      const cleanMobile = input.mobile.trim();
      if (!/^09\d{9}$/.test(cleanMobile)) {
        throw new ApiError(400, "فرمت شماره همراه معتبر نیست.");
      }
      baseCustUpdate.mobile = cleanMobile;
    }

    if (input.phone !== undefined) baseCustUpdate.phone = input.phone?.trim() || null;
    if (input.address !== undefined) baseCustUpdate.address = input.address?.trim() || null;
    if (input.notes !== undefined) baseCustUpdate.notes = input.notes?.trim() || null;

    if (Object.keys(baseCustUpdate).length > 1) {
      await tx
        .update(customers)
        .set(baseCustUpdate)
        .where(eq(customers.id, existing.customerId));
    }

    // Update studio fields
    const studioUpdate: Partial<typeof studioCustomers.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (input.customerType !== undefined) studioUpdate.customerType = input.customerType;
    if (input.groomName !== undefined) studioUpdate.groomName = input.groomName?.trim() || null;
    if (input.brideName !== undefined) studioUpdate.brideName = input.brideName?.trim() || null;
    if (input.contactPersonRole !== undefined) studioUpdate.contactPersonRole = input.contactPersonRole;
    if (input.socialMedia !== undefined) studioUpdate.socialMedia = input.socialMedia?.trim() || null;
    if (input.referrer !== undefined) studioUpdate.referrer = input.referrer?.trim() || null;
    if (input.notes !== undefined) studioUpdate.notes = input.notes?.trim() || null;
    if (input.anniversaryDate !== undefined) {
      studioUpdate.anniversaryDate = input.anniversaryDate ? new Date(input.anniversaryDate) : null;
    }
    if (input.specialPreferences !== undefined) studioUpdate.specialPreferences = input.specialPreferences;
    if (input.socialConsent !== undefined) studioUpdate.socialConsent = Boolean(input.socialConsent);
    if (input.vipLevel !== undefined) studioUpdate.vipLevel = input.vipLevel;

    const [updated] = await tx
      .update(studioCustomers)
      .set(studioUpdate)
      .where(eq(studioCustomers.id, id))
      .returning();

    return updated;
  });
}

export async function deleteStudioCustomer(id: string) {
  assertUuid(id);

  return db.transaction(async (tx) => {
    const [cust] = await tx.select().from(studioCustomers).where(eq(studioCustomers.id, id)).limit(1);
    if (!cust) throw new ApiError(404, "مشتری آتلیه یافت نشد.");

    // Check projects
    const [projectCount] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(studioProjects)
      .where(eq(studioProjects.studioCustomerId, id));

    if ((projectCount?.count || 0) > 0) {
      throw new ApiError(409, "این مشتری دارای پروژه‌های ثبت‌شده است و حذف آن مجاز نیست.");
    }

    await tx.delete(studioCustomers).where(eq(studioCustomers.id, id));

    return {
      success: true,
      message: "مشتری آتلیه با موفقیت حذف شد.",
    };
  });
}
