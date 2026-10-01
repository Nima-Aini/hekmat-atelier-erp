import { requiredMigrationIds } from "@/db/migrations";

export function missingRequiredMigrations(appliedIds: Iterable<string>) {
  const applied = new Set(appliedIds);
  return requiredMigrationIds.filter((id) => !applied.has(id));
}
