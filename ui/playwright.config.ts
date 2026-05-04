import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:8765",
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  // We expect the FastAPI server (which serves the built UI from ui/dist) to
  // be running. The webServer config boots it for us when it isn't.
  webServer: {
    command: ".venv/bin/python -m uvicorn scripts.server:app --host 127.0.0.1 --port 8765 --log-level warning",
    cwd: "..",
    url: "http://127.0.0.1:8765/api/health",
    reuseExistingServer: true,
    timeout: 15_000,
  },
});
