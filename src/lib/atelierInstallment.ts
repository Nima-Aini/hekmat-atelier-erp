/** Shared read model used by Finance and customer profiles; never posts money. */
export function atelierInstallmentState(amount: number, paidAmount: number, dueDate: Date | string, now = new Date()) {
  const remainingAmount = Math.max(0, amount - paidAmount);
  const daysToDue = Math.ceil((new Date(dueDate).getTime() - now.getTime()) / 86_400_000);
  const status = remainingAmount === 0 ? "paid" : paidAmount > 0 ? "partial" : daysToDue < 0 ? "overdue" : daysToDue <= 7 ? "due_soon" : "pending";
  return { paidAmount, remainingAmount, status, daysToDue, isOverdue: remainingAmount > 0 && daysToDue < 0 };
}
