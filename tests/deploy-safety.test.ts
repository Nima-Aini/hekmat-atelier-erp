import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const script = path.join(process.cwd(), "scripts", "validate-deploy-config.sh");
const deployScript = readFileSync(path.join(process.cwd(), "deploy.sh"), "utf8");
const stagingWorkflow = readFileSync(path.join(process.cwd(), ".github", "workflows", "deploy-staging.yml"), "utf8");
const nextEnvironment = readFileSync(path.join(process.cwd(), "next-env.d.ts"), "utf8");
const valid = {
  DEPLOY_PATH: "/var/www/hekmat-atelier-staging",
  PM2_APP_NAME: "hekmat-atelier-staging",
  APP_PORT: "4100",
  READINESS_URL: "https://staging.example.invalid/api/readiness",
  DEPLOY_REPOSITORY_URL: "https://github.com/Nima-Aini/hekmat-atelier-erp.git",
  EXPECTED_REPOSITORY_URL: "https://github.com/Nima-Aini/hekmat-atelier-erp.git",
};

function validate(overrides: Record<string, string>) {
  return spawnSync("bash", [script], { env: { ...process.env, ...valid, ...overrides }, encoding: "utf8" });
}

describe("deployment target safety", () => {
  it("accepts an explicit isolated Atelier target", () => {
    expect(validate({}).status).toBe(0);
  });

  it.each([
    ["broad path", { DEPLOY_PATH: "/var/www" }],
    ["legacy path", { DEPLOY_PATH: "/var/www/project2" }],
    ["legacy PM2 name", { PM2_APP_NAME: "akma-accounting" }],
    ["invalid port", { APP_PORT: "not-a-port" }],
    ["legacy repository", { DEPLOY_REPOSITORY_URL: "https://github.com/Nima-Aini/hekmat.git" }],
  ])("rejects %s", (_label, values) => {
    expect(validate(values).status).not.toBe(0);
  });

  it("automatically deploys only the staging branch while preserving manual dispatch", () => {
    expect(stagingWorkflow).toMatch(/push:\s*\n\s*branches:\s*\n\s*- codex\/phase2-hardening/);
    expect(stagingWorkflow).toContain("workflow_dispatch:");
    expect(stagingWorkflow).toContain("needs: [verify, restore-drill]");
    expect(stagingWorkflow).toContain("cancel-in-progress: false");
    expect(stagingWorkflow).toContain('bash /tmp/hekmat-atelier-staging-deploy.sh "${{ github.sha }}"');
  });

  it("creates a verified native backup before applying migrations", () => {
    const backup = deployScript.indexOf("npm run backup:create");
    const migration = deployScript.indexOf("npm run db:migrate");
    expect(backup).toBeGreaterThan(-1);
    expect(migration).toBeGreaterThan(backup);
  });

  it("only tolerates Next generated state when it exactly matches the target SHA", () => {
    expect(deployScript).toContain('DIRTY_TRACKED_PATHS" != "next-env.d.ts"');
    expect(deployScript).toContain('git show "${TARGET_SHA}:next-env.d.ts" | cmp -s - next-env.d.ts');
    expect(deployScript).toContain("git diff --cached --quiet");
    expect(nextEnvironment).toContain('import "./.next/types/routes.d.ts";');
    expect(nextEnvironment).not.toContain("/.next/dev/types/");
  });
});
