import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

const PUBLIC_PAGES = ["/", "/questions", "/ask", "/context", "/prayer", "/testimonies", "/testimonies/share", "/privacy"];
const WIDTHS = [320, 375, 390, 430, 768, 1024, 1440];

test("public pages have no horizontal overflow at any supported width", async ({ page }) => {
  test.setTimeout(240_000);
  const problems: string[] = [];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of PUBLIC_PAGES) {
      await page.goto(path, { waitUntil: "networkidle" });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 0) problems.push(`${path} @${width}px overflows by ${overflow}px`);
    }
  }
  expect(problems).toEqual([]);
});

test("public pages load without console errors or broken images", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${page.url()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`${page.url()}: ${error.message}`));
  for (const path of PUBLIC_PAGES) {
    await page.goto(path, { waitUntil: "networkidle" });
    const broken = await page.evaluate(() =>
      Array.from(document.images)
        .filter((img) => !img.complete || img.naturalWidth === 0)
        .map((img) => img.src),
    );
    expect(broken, `broken images on ${path}`).toEqual([]);
  }
  expect(errors).toEqual([]);
});

test("public pages have no serious accessibility violations", async ({ page }) => {
  for (const path of PUBLIC_PAGES) {
    await page.goto(path, { waitUntil: "networkidle" });
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    const serious = results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${path}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(" ")}`);
    expect(serious).toEqual([]);
  }
});

test("admin pages have no serious accessibility violations or overflow", async ({ page }) => {
  await signIn(page);
  for (const path of ["/admin", "/admin/questions", "/admin/context", "/admin/prayers", "/admin/testimonies", "/admin/sessions", "/admin/live"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    const serious = results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${path}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(" ")}`);
    expect(serious).toEqual([]);
  }
  await page.setViewportSize({ width: 375, height: 800 });
  for (const path of ["/admin", "/admin/questions", "/admin/sessions"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} at 375px`).toBeLessThanOrEqual(0);
  }
});

test("keyboard users can reach the main action and see focus", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  let found = false;
  for (let i = 0; i < 12 && !found; i++) {
    await page.keyboard.press("Tab");
    found = await page.evaluate(() => document.activeElement?.textContent?.trim() === "Ask a question");
  }
  expect(found).toBe(true);
  const ring = await page.evaluate(() => getComputedStyle(document.activeElement!).boxShadow);
  expect(ring).not.toBe("none");
});

test("reduced motion is respected", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  const duration = await page.evaluate(() => getComputedStyle(document.querySelector(".live-dot") ?? document.body).animationDuration);
  expect(["0s", "0.001s", "1ms"]).toContain(duration);
  await context.close();
});
