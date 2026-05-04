import { test, expect } from "@playwright/test";

test("Command page renders the always-visible blocks", async ({ page }) => {
  await page.goto("/");
  // KpiRow tile labels (kicker text — exact match to avoid strict-mode collisions)
  await expect(page.getByText("Sessions today", { exact: true })).toBeVisible();
  await expect(page.getByText("Effective tokens", { exact: true })).toBeVisible();
  await expect(page.getByText("Tool calls", { exact: true })).toBeVisible();
  // System health pills
  await expect(page.getByText("Uptime", { exact: true })).toBeVisible();
  await expect(page.getByText("OTEL", { exact: true })).toBeVisible();
});

test("Activity page mounts firehose + sessions table", async ({ page }) => {
  await page.goto("/activity");
  await expect(page.getByText(/Telemetry firehose/i).first()).toBeVisible();
  await expect(page.getByText("All sessions", { exact: true }).first()).toBeVisible();
});

test("Skills page renders MCP centerpiece", async ({ page }) => {
  await page.goto("/skills");
  await expect(page.getByText(/MCP servers/i).first()).toBeVisible();
  await expect(page.getByText(/Skills/i).first()).toBeVisible();
});
