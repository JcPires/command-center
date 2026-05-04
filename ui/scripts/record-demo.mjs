/**
 * Records a demo video of the Command Centre dashboard.
 * Output: docs/screenshots/demo.webm (≈ 30s, 1920×1080).
 *
 * Run from anywhere:
 *   node ui/scripts/record-demo.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const OUT_DIR = resolve(ROOT, "docs/screenshots");
mkdirSync(OUT_DIR, { recursive: true });

const URL = process.env.CC_URL || "http://127.0.0.1:8765/";
const W = 1920, H = 1080;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function setBodyAttr(page, attr, value) {
  await page.evaluate(([a, v]) => document.body.setAttribute(a, v), [attr, value]);
}
async function setStorageAndApply(page, key, value, attr) {
  await page.evaluate(
    ([k, v, a]) => {
      localStorage.setItem(k, v);
      if (a) document.body.setAttribute(a, v);
    },
    [key, value, attr],
  );
}
async function smoothScrollTo(page, y) {
  await page.evaluate((target) => window.scrollTo({ top: target, behavior: "smooth" }), y);
}
async function smoothScrollBy(page, dy, dur = 1500) {
  await page.evaluate(
    ([d, dt]) => {
      const start = window.scrollY;
      const t0 = performance.now();
      // easeInOutCubic — gentle start, gentle stop, smooth all the way
      const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
      function step(now) {
        const t = Math.min(1, (now - t0) / dt);
        window.scrollTo(0, start + d * ease(t));
        if (t < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    },
    [dy, dur],
  );
  await wait(dur);
}

async function smoothScrollToBottom(page, dur = 6000) {
  await page.evaluate(
    (dt) => {
      const total = document.documentElement.scrollHeight;
      const start = window.scrollY;
      const dist = total - start - window.innerHeight;
      const t0 = performance.now();
      const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
      function step(now) {
        const t = Math.min(1, (now - t0) / dt);
        window.scrollTo(0, start + dist * ease(t));
        if (t < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    },
    dur,
  );
  await wait(dur);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: W, height: H },
  recordVideo: { dir: OUT_DIR, size: { width: W, height: H } },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

// 0. Land — dark, indigo
await page.goto(URL);
await page.evaluate(() => {
  localStorage.setItem("cc-theme", "dark");
  localStorage.setItem("cc-palette", "indigo");
});
await page.reload();
await page.waitForSelector("h2:has-text('Aperçu')", { timeout: 10_000 });
await wait(1500);

// 1. Theme: dark → light (stays light for the rest of the demo)
await setStorageAndApply(page, "cc-theme", "light", "data-theme");
await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
await wait(1500);

// 2. Palette tour: sunset → ocean → mono → indigo
for (const p of ["sunset", "ocean", "mono", "indigo"]) {
  await setStorageAndApply(page, "cc-palette", p, "data-palette");
  await wait(700);
}
await wait(400);

// 3. Tokens card — hover a bar (tooltip) + toggle CACHE
await page.evaluate(() => {
  const h = Array.from(document.querySelectorAll("h3")).find(
    (x) => x.textContent && x.textContent.indexOf("Tokens · 14") >= 0,
  );
  if (h) h.scrollIntoView({ behavior: "smooth", block: "center" });
});
await wait(1100);

// Tag a bar to hover
await page.evaluate(() => {
  const titleH3 = Array.from(document.querySelectorAll("h3")).find(
    (x) => x.textContent && x.textContent.indexOf("Tokens · 14") >= 0,
  );
  let node = titleH3;
  for (let i = 0; i < 8; i++) {
    if (!node?.parentElement) break;
    node = node.parentElement;
    if (node.querySelector?.(".absolute.inset-0.flex.items-end")) break;
  }
  const bars = node.querySelector(".absolute.inset-0.flex.items-end");
  if (bars && bars.children.length > 2) bars.children[2].setAttribute("data-demo-bar", "1");
});
await page.locator("[data-demo-bar='1']").hover().catch(() => {});
await wait(1800);

// Move away then click the CACHE toggle
await page.mouse.move(960, 200);
await wait(300);
await page.locator("button[aria-label='Exclure le cache']").click().catch(() => {});
await wait(1700);
await page.locator("button[aria-label='Inclure le cache']").click().catch(() => {});
await wait(900);

// 4. Smooth scroll to bottom (gentle easeInOutCubic over 6s)
await smoothScrollToBottom(page, 6000);

// 5. Open task composer ("Queue a task")
await page.locator("button:has-text('Queue a task')").first().click().catch(() => {});
await wait(2000);
await page.keyboard.press("Escape");
await wait(400);

// 6. Open scheduler ("New schedule")
await page.locator("button:has-text('New schedule')").first().click().catch(() => {});
await wait(2200);
await page.keyboard.press("Escape");
await wait(400);

// 7. Navigate to Activité
await page.locator("nav a[href='/activity']").click().catch(() => {});
await wait(1500);
await smoothScrollBy(page, 800, 3500);
await wait(800);

// 8. Navigate to Compétences & MCP
await page.locator("nav a[href='/skills']").click().catch(() => {});
await wait(1500);
await smoothScrollBy(page, 1100, 3500);
await wait(800);

await context.close();
await browser.close();

console.log(`✓ Video saved under ${OUT_DIR}/`);
