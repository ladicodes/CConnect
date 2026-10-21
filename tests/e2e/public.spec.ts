import { expect, test } from "@playwright/test";
import { submitQuestion, testDb, unique } from "./helpers";

const db = testDb();
test.afterAll(async () => {
  await db.end();
});

test("homepage introduces Connect-Ask with the official logo and the main actions", async ({ page }) => {
  await page.goto("/");
  const logo = page.getByRole("img", { name: "Covenant Connect" }).first();
  await expect(logo).toBeVisible();
  expect(await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Ask what you");
  await expect(page.getByRole("link", { name: "Ask a question" })).toBeVisible();
  await expect(page.getByText("No account needed").first()).toBeVisible();
  await expect(page.getByText("Live now:", { exact: false })).toBeAttached();
  for (const label of ["Home", "Questions", "Prayer", "Testimonies"]) {
    await expect(page.getByRole("navigation", { name: "Main" }).last().getByRole("link", { name: label })).toBeVisible();
  }
});

test("asking a question saves it as pending, attached to the live service", async ({ page }) => {
  const text = unique("How can I keep praying when I feel distracted?");
  await submitQuestion(page, text);
  const rows = await db`select visibility, session_id from app.questions where body = ${text}`;
  expect(rows).toHaveLength(1);
  expect(rows[0].visibility).toBe("pending");
  expect(rows[0].session_id).not.toBeNull();
  // Not public until a leader approves it.
  await page.goto(`/questions?q=${encodeURIComponent(text.slice(-8))}`);
  await expect(page.getByText(text)).toHaveCount(0);
});

test("invalid input shows a clear error and keeps what was typed", async ({ page }) => {
  await page.goto("/ask");
  const field = page.getByLabel("Your question");
  await field.fill("??");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.getByText("Your question looks a little short")).toBeVisible();
  await expect(field).toHaveValue("??");
  await expect(field).toHaveAttribute("aria-invalid", "true");
});

test("a failed send keeps the text, and retrying never creates a duplicate", async ({ page }) => {
  const text = unique("Does God hear prayers said in my head?");
  let calls = 0;
  await page.route("**/api/questions", async (route) => {
    calls += 1;
    if (calls === 1) {
      // The server saves it, but the phone never hears back (e.g. Wi-Fi drops).
      await route.fetch();
      await route.abort("connectionreset");
      return;
    }
    await route.continue();
  });
  await page.goto("/ask");
  await page.getByLabel("Your question").fill(text);
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "still here" })).toBeVisible();
  await expect(page.getByLabel("Your question")).toHaveValue(text);
  await page.getByRole("button", { name: "Try sending again" }).click();
  await expect(page.getByRole("heading", { name: "Your question was received." })).toBeVisible();
  const [{ n }] = await db`select count(*)::int as n from app.questions where body = ${text}`;
  expect(n).toBe(1);
});

test("a draft survives a page reload", async ({ page }) => {
  await page.goto("/prayer");
  await page.getByLabel("Your prayer request").fill("Draft that should survive a reload");
  await page.reload();
  await expect(page.getByLabel("Your prayer request")).toHaveValue("Draft that should survive a reload");
  await page.getByLabel("Your prayer request").fill("");
});

test("prayer requests are saved privately and never shown publicly", async ({ page }) => {
  const text = unique("Please pray for my brother's recovery");
  await page.goto("/prayer");
  await expect(page.getByText("Private to church leaders.")).toBeVisible();
  await page.getByLabel("Your prayer request").fill(text);
  await page.getByRole("button", { name: "Send prayer request" }).click();
  await expect(page.getByRole("heading", { name: "Your prayer request was received." })).toBeVisible();
  expect((await db`select status from app.prayer_requests where body = ${text}`)[0]?.status).toBe("new");
  for (const path of ["/", "/questions", "/testimonies", `/questions?q=${encodeURIComponent("brother")}`]) {
    await page.goto(path);
    await expect(page.getByText(text)).toHaveCount(0);
  }
});

test("testimonies record the sharing choice and are not published on submit", async ({ page }) => {
  const text = unique("I passed my final exams this week");
  await page.goto("/testimonies/share");
  await page.getByRole("radio", { name: "Testimony" }).click();
  await page.getByLabel("Your testimony").fill(text);
  await page.getByLabel("Name to show").fill("Bisi");
  await page.getByRole("radio", { name: /Leaders may share it publicly/ }).check();
  await page.getByRole("button", { name: "Send to church leaders" }).click();
  await expect(page.getByRole("heading", { name: "Thank you for sharing." })).toBeVisible();
  const [row] = await db`select kind, display_name, share_consent, status from app.testimonies where body = ${text}`;
  expect(row).toEqual({ kind: "testimony", display_name: "Bisi", share_consent: true, status: "pending" });
  await page.goto("/testimonies");
  await expect(page.getByText(text)).toHaveCount(0);
});

test("the Question Board shows approved questions only, with filters and search", async ({ page }) => {
  await page.goto("/questions");
  await expect(page.getByText("If God already knows what I'm going to pray")).toBeVisible();
  await expect(page.getByText("kept private by a leader")).toHaveCount(0);
  await expect(page.getByText("How do I forgive someone")).toHaveCount(0); // pending in the sample data

  await page.getByRole("link", { name: "Answered", exact: true }).click();
  await expect(page).toHaveURL(/filter=answered/);
  await expect(page.getByText("Is it wrong to have doubts")).toHaveCount(0);

  await page.goto("/questions");
  await page.getByRole("searchbox", { name: "Search questions" }).fill("doubts");
  await page.getByRole("searchbox", { name: "Search questions" }).press("Enter");
  await expect(page.getByText("Is it wrong to have doubts")).toBeVisible();
  await expect(page.getByText("If God already knows")).toHaveCount(0);

  await page.goto("/questions?view=earlier");
  await expect(page.getByText("What is the difference between grace and mercy?")).toBeVisible();
});

test("“me too” can be added and removed, survives a reload, and is counted once", async ({ page }) => {
  await page.goto("/questions");
  const row = page.getByRole("listitem").filter({ hasText: "Is it wrong to have doubts" });
  const button = row.getByRole("button", { name: /Me too|You too/ });
  const before = Number(await button.locator("span").first().innerText());
  const saved = page.waitForResponse((r) => r.url().includes("/support") && r.request().method() === "POST");
  await button.click();
  expect((await saved).status()).toBe(200);
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(button).toContainText(String(before + 1));
  await page.reload();
  const again = page.getByRole("listitem").filter({ hasText: "Is it wrong to have doubts" }).getByRole("button", { name: /Me too|You too/ });
  await expect(again).toHaveAttribute("aria-pressed", "true");
  await expect(again).toContainText(String(before + 1));
  await again.click();
  await expect(again).toHaveAttribute("aria-pressed", "false");
  await expect(again).toContainText(String(before));
});

test("linked context is attached to the exact question and reviewed first", async ({ page }) => {
  await page.goto("/questions");
  await page.getByRole("link", { name: /renew your mind/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("renew your mind");
  const questionUrl = page.url();
  const questionId = questionUrl.split("/").pop()!;
  await page.getByRole("region", { name: "Context" }).getByRole("link", { name: "Add context" }).click();
  const text = unique("Romans 12:2 is the verse about renewing the mind");
  await page.getByLabel("Your context").fill(text);
  await page.getByRole("button", { name: "Send context" }).click();
  await expect(page.getByRole("heading", { name: "Thank you for adding context." })).toBeVisible();
  const [row] = await db`select question_id, status from app.context_notes where body = ${text}`;
  expect(row).toEqual({ question_id: questionId, status: "pending" });
  await page.goto(questionUrl);
  await expect(page.getByText(text)).toHaveCount(0);
});

test("a question that is not public has no public page", async ({ page }) => {
  const [hidden] = await db`select id from app.questions where visibility = 'private' limit 1`;
  await page.goto(`/questions/${hidden.id}`);
  await expect(page.getByText("This question isn’t on the board")).toBeVisible();
  await expect(page.getByText("kept private by a leader")).toHaveCount(0);
});
