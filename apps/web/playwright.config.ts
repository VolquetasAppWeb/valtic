import { defineConfig, devices } from "@playwright/test";

// Corre contra el web (3000) y la API (3001) ya en ejecucion en desarrollo
// (pnpm dev:web / pnpm dev:api) — no levanta servidores propios, para poder
// usar los mismos datos de seed en cada corrida sin recompilar nada.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
