import { ApiError } from "@/lib/apiError";
import { toLatinDigits } from "@/lib/dateUtils";
import { canAccessPermission, type EmployeeContext } from "@/services/access";

type DailyVisitMutation = Record<string, unknown>;

export function requiredDailyVisitFinancialPermissions(input: DailyVisitMutation, createsInitialReceipt: boolean) {
  const required: string[] = [];
  const paidAmount = Number(toLatinDigits(String(input.paidAmount ?? 0)).replace(/,/g, ""));
  if (createsInitialReceipt && Number.isFinite(paidAmount) && paidAmount > 0) required.push("studio.finance.create_receipt");
  // Supplying the assignment list can create, change, or reverse canonical wage expenses.
  if (input.personnelAssignments !== undefined) required.push("studio.finance.create_expense");
  return required;
}

export async function assertDailyVisitFinancialPermissions(
  actor: EmployeeContext,
  input: DailyVisitMutation,
  createsInitialReceipt: boolean,
) {
  for (const permission of requiredDailyVisitFinancialPermissions(input, createsInitialReceipt)) {
    if (!await canAccessPermission(actor, permission)) {
      throw new ApiError(403, `دسترسی مالی موردنیاز برای این عملیات وجود ندارد: ${permission}`, "PERMISSION_REQUIRED");
    }
  }
}
