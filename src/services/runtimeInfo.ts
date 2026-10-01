import { activeDatabaseDriver } from "@/db";

const SHA = /^[0-9a-f]{7,40}$/i;

export function getRuntimeInfo(env: NodeJS.ProcessEnv = process.env) {
  const gitSha = env.GIT_SHA?.trim();
  return {
    applicationVersion: env.npm_package_version || "0.0.0",
    gitSha: gitSha && SHA.test(gitSha) ? gitSha : "unknown",
    environment: env.APP_ENV?.trim() || env.NODE_ENV || "development",
    databaseDriver: activeDatabaseDriver,
  };
}
