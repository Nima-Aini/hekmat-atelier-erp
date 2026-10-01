import { db } from "@/db";
import { studioContracts, studioProjects } from "@/db/schema";
import { ApiError, assertUuid } from "@/lib/apiError";
import { eq } from "drizzle-orm";

export async function resolveStudioProjectScope(studioProjectId: string) {
  assertUuid(studioProjectId);
  const [row] = await db.select({ coreProjectId: studioProjects.projectId }).from(studioProjects).where(eq(studioProjects.id, studioProjectId)).limit(1);
  if (!row) throw new ApiError(404, "پروژه آتلیه یافت نشد.");
  if (!row.coreProjectId) throw new ApiError(422, "پروژه قدیمی هنوز به پروژه مالی متصل نشده است.");
  return row.coreProjectId;
}
export async function resolveStudioContractScope(contractId: string) {
  assertUuid(contractId);
  const [row] = await db.select({ studioProjectId: studioContracts.studioProjectId, coreProjectId: studioProjects.projectId }).from(studioContracts).innerJoin(studioProjects, eq(studioContracts.studioProjectId, studioProjects.id)).where(eq(studioContracts.id, contractId)).limit(1);
  if (!row) throw new ApiError(404, "قرارداد آتلیه یافت نشد.");
  if (!row.coreProjectId) throw new ApiError(422, "پروژه قدیمی هنوز به پروژه مالی متصل نشده است.");
  return row;
}
