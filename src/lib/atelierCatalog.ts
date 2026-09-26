export type AtelierCatalogRow = {
  id: string;
  kind: string;
  name: string;
  description?: string | null;
  basePrice?: string | number | null;
  defaultPrice?: number | null;
  active?: boolean;
  itemIds?: string[];
  specifications?: unknown;
};

export type ContractItemSnapshot = {
  title: string;
  description: string;
  quantity: number;
  unitPrice: number;
  notes: string;
};

export function expandPackageToContractItems(
  selectedPackage: AtelierCatalogRow,
  catalog: AtelierCatalogRow[],
): ContractItemSnapshot[] {
  const specifications = selectedPackage.specifications && typeof selectedPackage.specifications === "object"
    ? selectedPackage.specifications as { itemIds?: unknown }
    : null;
  const itemIds = Array.isArray(selectedPackage.itemIds)
    ? selectedPackage.itemIds
    : Array.isArray(specifications?.itemIds)
      ? specifications.itemIds.filter((id): id is string => typeof id === "string")
      : [];
  return itemIds.flatMap((id) => {
    const item = catalog.find(
      (candidate) =>
        candidate.id === id &&
        candidate.kind === "service" &&
        candidate.active !== false,
    );
    if (!item) return [];
    return [{
      title: item.name,
      description: item.description || "",
      quantity: 1,
      unitPrice: Number(item.basePrice ?? item.defaultPrice ?? 0),
      notes: `افزوده‌شده از ${selectedPackage.name}`,
    }];
  });
}
