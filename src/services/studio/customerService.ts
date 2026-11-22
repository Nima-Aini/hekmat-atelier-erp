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
import { ApiError, assertUuid, decimal, pageNumber } from "@/lib/apiError";
import { logAuditEvent, type AuditContext } from "@/services/audit";

export interface CreateStudioCustomerInput {
  customerId?: string | null;
  name: string;
  mobile: string;
  phone?: string | null;
  address?: string | null;
  socialMedia?: string | null;
  referrer?: string | null;
  customerType?: string;
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
  expectedRevision?: { customer: string; studio: string };
  latitude?: string | null;
  longitude?: string | null;
  paymentTermsDays?: string | number | null;
  creditLimit?: string | number | null;
  name?: string;
  mobile?: string;
  email?: string | null;
  storeName?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  customerNotes?: string | null;
  studioNotes?: string | null;
  phone?: string | null;
  address?: string | null;
  socialMedia?: string | null;
  referrer?: string | null;
  customerType?: "wedding" | "portrait" | "commercial" | "family" | "industrial" | "event" | "child" | "modeling";
  groomName?: string | null;
  brideName?: string | null;
  contactPersonRole?: "groom" | "bride" | "father" | "mother" | "manager" | "self" | "other" | null;
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
            city: null,
            paymentTermsDays: null,
            creditLimit: null,
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
        contactPersonRole: input.contactPersonRole || null,
        anniversaryDate: annDate,
        specialPreferences: typeof input.specialPreferences === "string" ? input.specialPreferences.trim() || null : null,
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

export async function updateStudioCustomer(id: string, input: UpdateStudioCustomerInput, audit?: AuditContext, canEditCredit = false) {
  assertUuid(id);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ApiError(400, "اطلاعات مشتری معتبر نیست.");

  const optionalText = (value: unknown, max = 2000) => {
    if (value === null) return null;
    if (typeof value !== "string" || value.trim().length > max) throw new ApiError(400, "مقدار یکی از فیلدهای مشتری معتبر نیست.");
    return value.trim() || null;
  };

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: studioCustomers.id,
        customerId: studioCustomers.customerId,
        customerUpdatedAt: customers.updatedAt,
        studioUpdatedAt: studioCustomers.updatedAt,
      })
      .from(studioCustomers)
      .innerJoin(customers, eq(customers.id, studioCustomers.customerId))
      .where(eq(studioCustomers.id, id))
      .limit(1)
      .for("update");

    if (!existing) {
      throw new ApiError(404, "مشتری آتلیه یافت نشد.");
    }

    if (input.expectedRevision && (
      input.expectedRevision.customer !== existing.customerUpdatedAt.toISOString() ||
      input.expectedRevision.studio !== existing.studioUpdatedAt.toISOString()
    )) {
      throw new ApiError(409, "پرونده پس از تهیه پیشنهاد تغییر کرده است. پیش‌نمایش تازه‌ای بگیرید.", "CUSTOMER_REVISION_CHANGED");
    }

    // Update base customer fields if provided
    const baseCustUpdate: Partial<typeof customers.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (input.name !== undefined) {
      const name = optionalText(input.name, 200);
      if (!name) throw new ApiError(400, "نام مشتری نباید خالی باشد.");
      baseCustUpdate.name = name;
    }

    if (input.mobile !== undefined) {
      const cleanMobile = optionalText(input.mobile, 11);
      if (!cleanMobile || !/^09\d{9}$/.test(cleanMobile)) {
        throw new ApiError(400, "فرمت شماره همراه معتبر نیست.");
      }
      baseCustUpdate.mobile = cleanMobile;
    }

    for (const key of ["phone", "address", "storeName", "city", "region", "postalCode"] as const) {
      if (input[key] !== undefined) baseCustUpdate[key] = optionalText(input[key]);
    }
    if (input.email !== undefined) {
      const email = optionalText(input.email, 254);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, "ایمیل معتبر نیست.");
      baseCustUpdate.email = email;
    }
    for (const key of ["latitude", "longitude"] as const) {
      if (input[key] === undefined) continue;
      const coordinate = optionalText(input[key], 30);
      if (coordinate && (!Number.isFinite(Number(coordinate)) || Math.abs(Number(coordinate)) > (key === "latitude" ? 90 : 180))) {
        throw new ApiError(400, "مختصات جغرافیایی معتبر نیست.");
      }
      baseCustUpdate[key] = coordinate;
    }
    if (input.paymentTermsDays !== undefined || input.creditLimit !== undefined) {
      if (!canEditCredit) throw new ApiError(403, "ویرایش شرایط اعتباری پرونده به مجوز مدیر نیاز دارد.");
      if (input.paymentTermsDays !== undefined) {
        const terms = input.paymentTermsDays === null || input.paymentTermsDays === "" ? null : Number(input.paymentTermsDays);
        if (terms !== null && (!Number.isInteger(terms) || terms < 0 || terms > 3650)) throw new ApiError(400, "مهلت پرداخت معتبر نیست.");
        baseCustUpdate.paymentTermsDays = terms;
      }
      if (input.creditLimit !== undefined) {
        baseCustUpdate.creditLimit = input.creditLimit === null || input.creditLimit === "" ? null : decimal(input.creditLimit, "سقف اعتبار", 2);
      }
    }
    const customerNotes = input.customerNotes === undefined ? input.notes : input.customerNotes;
    if (customerNotes !== undefined) baseCustUpdate.notes = optionalText(customerNotes);

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
    for (const key of ["groomName", "brideName", "socialMedia", "referrer", "specialPreferences"] as const) {
      if (input[key] !== undefined) studioUpdate[key] = optionalText(input[key]);
    }
    if (input.contactPersonRole !== undefined) {
      if (input.contactPersonRole !== null && !["groom", "bride", "father", "mother", "manager", "self", "other"].includes(input.contactPersonRole)) throw new ApiError(400, "نقش مخاطب معتبر نیست.");
      studioUpdate.contactPersonRole = input.contactPersonRole;
    }
    const studioNotes = input.studioNotes === undefined ? input.notes : input.studioNotes;
    if (studioNotes !== undefined) studioUpdate.notes = optionalText(studioNotes);
    if (input.anniversaryDate !== undefined) {
      const anniversary = input.anniversaryDate ? new Date(input.anniversaryDate) : null;
      if (anniversary && !Number.isFinite(anniversary.getTime())) throw new ApiError(400, "تاریخ مناسبت معتبر نیست.");
      studioUpdate.anniversaryDate = anniversary;
    }
    if (input.socialConsent !== undefined) {
      if (typeof input.socialConsent !== "boolean") throw new ApiError(400, "رضایت انتشار تصاویر معتبر نیست.");
      studioUpdate.socialConsent = input.socialConsent;
    }
    if (input.vipLevel !== undefined) {
      if (!["standard", "gold", "platinum", "vip"].includes(input.vipLevel)) throw new ApiError(400, "سطح مشتری معتبر نیست.");
      studioUpdate.vipLevel = input.vipLevel;
    }

    const [updated] = await tx
      .update(studioCustomers)
      .set(studioUpdate)
      .where(eq(studioCustomers.id, id))
      .returning();

    const changedFields = [
      ...Object.keys(baseCustUpdate).filter(key => key !== "updatedAt").map(key => `customer.${key}`),
      ...Object.keys(studioUpdate).filter(key => key !== "updatedAt").map(key => `studio.${key}`),
    ];
    if (audit && changedFields.length) await logAuditEvent("STUDIO_CUSTOMER_UPDATED", "studio_customer", id, { changedFields }, audit, tx);
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
