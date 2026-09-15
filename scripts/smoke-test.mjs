const baseUrl = process.env.SMOKE_BASE_URL;
const expectedSha = process.env.EXPECTED_GIT_SHA;
const expectedEnvironment = process.env.EXPECTED_APP_ENV;
const expectedSchemaVersion = process.env.EXPECTED_SCHEMA_VERSION;
if (!baseUrl || !expectedSha || !expectedEnvironment || !expectedSchemaVersion) throw new Error("SMOKE_BASE_URL, EXPECTED_GIT_SHA, EXPECTED_APP_ENV and EXPECTED_SCHEMA_VERSION are required.");

async function json(path) {
  const response = await fetch(new URL(path, baseUrl), { redirect: "error" });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

const health = await json("/api/health");
if (!health.response.ok || health.body.status !== "ok" || health.body.process !== "alive") throw new Error("Health smoke test failed.");
const readiness = await json("/api/readiness");
if (!readiness.response.ok || readiness.body.status !== "ready") throw new Error("Readiness smoke test failed.");
if (readiness.body.gitSha !== expectedSha) throw new Error(`Deployed SHA mismatch: expected ${expectedSha}, received ${readiness.body.gitSha}`);
if (readiness.body.environment !== expectedEnvironment) throw new Error(`Environment mismatch: expected ${expectedEnvironment}, received ${readiness.body.environment}`);
if (readiness.body.schemaVersion !== expectedSchemaVersion || readiness.body.migrations?.status !== "current") throw new Error("Migration/schema readiness mismatch.");
if (readiness.body.database?.driver !== "postgres" || readiness.body.database?.status !== "connected") throw new Error("Staging readiness is not backed by PostgreSQL.");
const auth = await json("/api/auth/employee-me");
if (auth.response.status !== 401) throw new Error("Authentication boundary smoke test failed.");
const studio = await json("/api/studio/projects");
if (studio.response.status !== 401) throw new Error("Studio authorization smoke test failed.");
console.log("smoke.success", { gitSha: readiness.body.gitSha, schemaVersion: readiness.body.schemaVersion, environment: readiness.body.environment, databaseDriver: readiness.body.database.driver });
