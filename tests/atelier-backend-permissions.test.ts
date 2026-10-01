import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  permissions: new Set<string>(),
  required: [] as string[],
  customerRequired: [] as string[],
}));

vi.mock("@/services/access", async () => {
  const { ApiError } = await import("../src/lib/apiError");
  const actor = () => ({ employeeId: "00000000-0000-4000-8000-000000000091", employeeName: "تست امنیت", permissions: new Set(state.permissions) });
  return {
    requirePermission: vi.fn(async (permission: string) => {
      state.required.push(permission);
      if (!state.permissions.has("*") && !state.permissions.has(permission)) throw new ApiError(403, "دسترسی مجاز نیست", "PERMISSION_REQUIRED");
      return actor();
    }),
    requireAnyPermission: vi.fn(async () => actor()),
    canAccessPermission: vi.fn(async (_actor: unknown, permission: string) => state.permissions.has("*") || state.permissions.has(permission)),
    getScopedProjectIds: vi.fn(async () => []),
  };
});

vi.mock("@/services/studio/access", async () => {
  const { ApiError } = await import("../src/lib/apiError");
  return {
    requireStudioCustomerAccess: vi.fn(async (_id: string, permission: string) => {
      state.customerRequired.push(permission);
      if (!state.permissions.has("*") && !state.permissions.has(permission)) throw new ApiError(403, "دسترسی مجاز نیست", "PERMISSION_REQUIRED");
      return { employeeId: "00000000-0000-4000-8000-000000000091", employeeName: "تست امنیت", permissions: new Set(state.permissions) };
    }),
  };
});

const workflow = vi.hoisted(() => ({
  saveDailyVisit: vi.fn(async () => ({ id: "visit" })),
  listDailyVisits: vi.fn(async () => []),
  deleteDailyVisit: vi.fn(),
  convertReservationToDailyVisit: vi.fn(async () => ({ id: "converted" })),
  completeReservation: vi.fn(),
  deleteReservation: vi.fn(),
  saveReservation: vi.fn(),
}));
vi.mock("@/services/studio/finalWorkflow", () => workflow);
vi.mock("@/services/studio/financeCenter", () => ({ recordAtelierReceipt: vi.fn(async () => ({ id: "payment" })) }));
vi.mock("@/services/studio/customerService", () => ({
  listStudioCustomers: vi.fn(async () => ({ customers: [], pagination: {} })),
  createStudioCustomer: vi.fn(async () => ({ id: "customer" })),
  getStudioCustomerById: vi.fn(async () => ({ projects: [] })),
  updateStudioCustomer: vi.fn(async () => ({ id: "customer" })),
  deleteStudioCustomer: vi.fn(async () => ({ success: true })),
}));

import { POST as createVisit } from "../src/app/api/atelier/daily-visits/route";
import { PUT as updateVisit } from "../src/app/api/atelier/daily-visits/[id]/route";
import { POST as payVisit } from "../src/app/api/atelier/daily-visits/[id]/payments/route";
import { PUT as updateReservation } from "../src/app/api/atelier/reservations/[id]/route";
import { POST as createStudioCustomerRoute } from "../src/app/api/studio/customers/route";
import { PUT as updateStudioCustomerRoute, DELETE as deleteStudioCustomerRoute } from "../src/app/api/studio/customers/[id]/route";
import { PUT as updateAtelierCustomerRoute } from "../src/app/api/atelier/customers/[id]/route";
import { AI_OPERATIONS } from "../src/services/aiOperations";

const request = (method: string, body: unknown) => new NextRequest("http://localhost/api/test", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const params = { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000092" }) };

describe("Atelier backend granular permissions", () => {
  beforeEach(() => {
    state.permissions = new Set();
    state.required = [];
    state.customerRequired = [];
    vi.clearAllMocks();
  });

  it("requires receipt permission for an initial daily-visit payment", async () => {
    state.permissions.add("studio.daily_visits.manage");
    expect((await createVisit(request("POST", { paidAmount: "۱۰۰۰" }))).status).toBe(403);
    expect(workflow.saveDailyVisit).not.toHaveBeenCalled();
    state.permissions.add("studio.finance.create_receipt");
    expect((await createVisit(request("POST", { paidAmount: "۱۰۰۰" }))).status).toBe(201);
  });

  it("requires expense permission whenever daily-visit wage assignments are supplied", async () => {
    state.permissions.add("studio.daily_visits.manage");
    expect((await updateVisit(request("PUT", { personnelAssignments: [] }), params)).status).toBe(403);
    state.permissions.add("studio.finance.create_expense");
    expect((await updateVisit(request("PUT", { personnelAssignments: [] }), params)).status).toBe(200);
  });

  it("requires both visit and receipt permissions for payment and reservation conversion", async () => {
    state.permissions.add("studio.daily_visits.manage");
    expect((await payVisit(request("POST", { amount: 10 }), params)).status).toBe(403);
    state.permissions = new Set(["studio.reservations.edit"]);
    expect((await updateReservation(request("PUT", { action: "convert_to_daily_visit", dailyVisit: { paidAmount: 0 } }), params)).status).toBe(403);
    state.permissions = new Set(["studio.reservations.edit", "studio.daily_visits.manage", "studio.finance.create_receipt"]);
    expect((await updateReservation(request("PUT", { action: "convert_to_daily_visit", dailyVisit: { paidAmount: 10 } }), params)).status).toBe(200);
  });

  it("uses customer create, edit, and delete permissions on customer CRUD", async () => {
    state.permissions.add("studio.customers.create");
    expect((await createStudioCustomerRoute(request("POST", { name: "الف", mobile: "09120000000" }))).status).toBe(201);
    expect(state.required).toContain("studio.customers.create");
    state.permissions = new Set(["studio.customers.edit"]);
    expect((await updateStudioCustomerRoute(request("PUT", { name: "ب" }), params)).status).toBe(200);
    expect((await updateAtelierCustomerRoute(request("PUT", { name: "ج" }), params)).status).toBe(200);
    expect(state.customerRequired).toContain("studio.customers.edit");
    state.permissions = new Set(["studio.customers.delete"]);
    expect((await deleteStudioCustomerRoute(new NextRequest("http://localhost/api/test", { method: "DELETE" }), params)).status).toBe(200);
    expect(state.customerRequired).toContain("studio.customers.delete");
  });

  it("keeps AI customer operations aligned with their real handlers", () => {
    expect(AI_OPERATIONS.customer_create).toMatchObject({ permission: "studio.customers.create", method: "POST" });
    expect(AI_OPERATIONS.customer_update).toMatchObject({ permission: "studio.customers.edit", method: "PUT" });
    expect(AI_OPERATIONS.customer_task_create).toMatchObject({ permission: "studio.planning.manage", method: "POST" });
  });
});
