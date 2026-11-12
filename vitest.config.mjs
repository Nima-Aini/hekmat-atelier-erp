import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    env: process.env.CI ? {} : { DB_DRIVER: "pglite" },
    pool: "forks",
    fileParallelism: false,
    exclude: ["**/.next/**", "**/node_modules/**"],
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
