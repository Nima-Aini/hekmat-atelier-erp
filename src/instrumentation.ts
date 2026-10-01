/**
 * Next.js instrumentation hook - runs once on server startup.
 * Automatically migrates and seeds the database.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { migrateDatabase } = await import("./db/migrate");
    const { seedDatabase } = await import("./db/seed");
    const { ensureDefaultAdminAccount } = await import("./services/employeeAuth");
    const { getRuntimeInfo } = await import("./services/runtimeInfo");
    const { requiredMigrationIds } = await import("./db/migrations");
    try {
      await migrateDatabase();
      await seedDatabase();
      await ensureDefaultAdminAccount();
      console.log("Database migrations, seed, and bootstrap completed successfully.");
      console.info("application.startup", { ...getRuntimeInfo(), schemaVersion: requiredMigrationIds.at(-1) || "baseline" });
    } catch (error) {
      console.error("Fatal database initialization failure; application will not become ready.", error);
      throw error;
    }
  }
}
