import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { invoices, payments, studioContracts, studioInstallmentAllocations, studioInstallments, studioProjectPayments } from "@/db/schema";
import type { Transaction } from "@/services/product";

/** Only posted mirrors backed by a completed canonical receipt count as installment payment. */
export async function readPostedInstallmentAllocations(client: typeof db | Transaction, installmentIds: string[]) {
  if (!installmentIds.length) return [];
  return client.select({ allocation: studioInstallmentAllocations, payment: payments }).from(studioInstallmentAllocations)
    .innerJoin(studioInstallments, eq(studioInstallments.id, studioInstallmentAllocations.installmentId))
    .innerJoin(studioContracts, eq(studioContracts.id, studioInstallments.contractId))
    .innerJoin(invoices, eq(invoices.id, studioContracts.invoiceId))
    .innerJoin(studioProjectPayments, eq(studioProjectPayments.id, studioInstallmentAllocations.studioPaymentId))
    .innerJoin(payments, eq(payments.id, studioProjectPayments.paymentId))
    .where(and(inArray(studioInstallmentAllocations.installmentId, installmentIds), eq(studioProjectPayments.financialStatus, "posted"),
      eq(payments.status, "completed"), eq(payments.paymentType, "customer_receipt"), eq(payments.customerId, invoices.customerId),
      eq(payments.invoiceId, invoices.id), eq(studioProjectPayments.invoiceId, invoices.id)));
}
