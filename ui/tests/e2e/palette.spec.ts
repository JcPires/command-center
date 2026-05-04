import { test, expect } from "@playwright/test";

test("Cmd+K opens the command palette and navigates to Activity", async ({ page }) => {
  await page.goto("/");
  // The shortcut listens for both Meta+K and Control+K
  await page.keyboard.press("Meta+K");
  const input = page.getByPlaceholder(/Type a command/i);
  await expect(input).toBeVisible();
  await input.fill("activity");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/activity/);
});
