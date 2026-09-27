import type { getContractById } from "./finalWorkflow";

export function redactContractFinance(contract: Awaited<ReturnType<typeof getContractById>>) {
  return {
    ...contract,
    totalAmount: null, discountAmount: null, depositAmount: null,
    paidAmount: null, remainingAmount: null, itemsTotal: null, financialNotes: null,
    typeMetadata: { ...(contract.typeMetadata && typeof contract.typeMetadata === "object" && !Array.isArray(contract.typeMetadata) ? contract.typeMetadata : {}), paymentDraft: undefined },
    project: { ...contract.project, totalContractValue: null },
    items: contract.items.map(item => ({ ...item, unitPrice: null })),
  };
}
