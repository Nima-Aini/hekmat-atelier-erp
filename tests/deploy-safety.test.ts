import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";

const script = path.join(process.cwd(), "scripts", "validate-deploy-config.sh");
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
});
