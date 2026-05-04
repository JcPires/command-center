import { test, expect, request } from "@playwright/test";

test.afterEach(async ({}, testInfo) => {
  // Clean up any schedule we created so re-runs stay deterministic
  const ctx = await request.newContext({ baseURL: "http://127.0.0.1:8765" });
  const r = await ctx.get("/api/schedules");
  if (r.ok()) {
    const { rows } = await r.json();
    for (const s of rows) {
      if (typeof s.name === "string" && s.name.startsWith("E2E ")) {
        await ctx.delete(`/api/schedules/${s.id}`);
      }
    }
  }
});

test("Schedule composer creates a schedule via the visual builder", async ({ page }) => {
  await page.goto("/");

  // Mission Control section is collapsible — make sure it's open.
  const mc = page.getByRole("button", { name: /Mission Control/i });
  if (await mc.getAttribute("aria-expanded") === "false") {
    await mc.click();
  }

  await page.getByRole("button", { name: /New schedule/i }).click();

  await page.getByPlaceholder(/Morning sweep/i).fill("E2E test schedule");
  await page.getByPlaceholder(/each materialised task/i).fill("E2E task title");

  // Cron preview should appear
  await expect(page.locator("code", { hasText: /\* \*/ })).toBeVisible();

  await page.getByRole("button", { name: /^Create$/i }).click();

  // Schedule should now show up in the list
  await expect(page.getByText(/E2E test schedule/i)).toBeVisible();
});
