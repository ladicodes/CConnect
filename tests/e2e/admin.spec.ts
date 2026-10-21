import { expect, test } from "@playwright/test";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { MODERATOR, signIn, submitQuestion, testDb, unique } from "./helpers";

const db = testDb();
test.afterAll(async () => {
  await db.end();
});

test("admin pages and APIs require sign-in", async ({ page, request }) => {
  await page.goto("/admin/questions");
  await expect(page).toHaveURL(/\/admin\/login$/);
  expect((await request.get("/api/presentation")).status()).toBe(401);
  expect((await request.get("/api/qr?format=png")).status()).toBe(401);
});

test("a wrong password is refused with a clear message", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@connect-ask.local");
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "don't match" })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/login/);
});

test("moderation: approve, answer, hide, with the public board following each change", async ({ page, context }) => {
  const text = unique("Can someone explain the parable of the talents?");
  const visitor = await context.browser()!.newPage();
  await submitQuestion(visitor, text);

  await signIn(page);
  await page.goto(`/admin/questions?q=${encodeURIComponent(text)}`);
  await page.getByRole("link", { name: text }).click();
  const detail = page.getByRole("region", { name: "Selected question" });
  await detail.getByRole("button", { name: "On board" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Approved for the board" })).toBeVisible();

  await visitor.goto(`/questions?q=${encodeURIComponent("parable of the talents")}`);
  await expect(visitor.getByText(text)).toBeVisible();

  await page.goto(`/admin/questions?tab=public&q=${encodeURIComponent(text)}`);
  await page.getByRole("link", { name: text }).click();
  await detail.getByRole("button", { name: "Answered" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Marked as answered" })).toBeVisible();
  const [row] = await db`select id, visibility, answer_status from app.questions where body = ${text}`;
  expect(row).toMatchObject({ visibility: "public", answer_status: "answered" });

  await visitor.goto(`/questions/${row.id}`);
  await expect(visitor.getByText("Answered").first()).toBeVisible();

  await detail.getByRole("button", { name: "Hidden" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Hidden from the board" })).toBeVisible();
  await visitor.goto(`/questions/${row.id}`);
  await expect(visitor.getByText("This question isn’t on the board")).toBeVisible();
  // Answer status survived the visibility change: they are independent.
  expect((await db`select answer_status from app.questions where id = ${row.id}`)[0].answer_status).toBe("answered");
});

test("deleting requires confirmation", async ({ page }) => {
  const text = unique("Please delete this test question");
  const [{ id }] = await db`insert into app.questions (client_submission_id, body) values (gen_random_uuid(), ${text}) returning id`;
  await signIn(page);
  await page.goto(`/admin/questions?id=${id}`);
  await page.getByRole("region", { name: "Selected question" }).getByRole("button", { name: "Delete…" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete this question?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect(await db`select id from app.questions where id = ${id}`).toHaveLength(1);
  await page.getByRole("region", { name: "Selected question" }).getByRole("button", { name: "Delete…" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete permanently" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Question deleted" })).toBeVisible();
  expect(await db`select id from app.questions where id = ${id}`).toHaveLength(0);
});

test("moderators cannot see prayer requests or testimonies", async ({ page }) => {
  await signIn(page, MODERATOR);
  const nav = page.getByRole("navigation", { name: "Admin" }).first();
  await expect(nav.getByRole("link", { name: /Questions/ })).toBeVisible();
  await expect(nav.getByRole("link", { name: /Prayer requests/ })).toHaveCount(0);
  await page.goto("/admin/prayers");
  await expect(page.getByRole("heading", { name: "This area is for administrators" })).toBeVisible();
  await expect(page.getByText("Pray for my family")).toHaveCount(0);
  await page.goto("/admin/testimonies");
  await expect(page.getByRole("heading", { name: "This area is for administrators" })).toBeVisible();
});

test("admins manage prayer requests", async ({ page }) => {
  const text = unique("Pray for strength during my exams");
  await db`insert into app.prayer_requests (client_submission_id, body) values (gen_random_uuid(), ${text})`;
  await signIn(page);
  await page.goto("/admin/prayers");
  const item = page.getByRole("listitem").filter({ hasText: text });
  await item.getByRole("button", { name: "Mark prayed for" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Marked as prayed for" })).toBeVisible();
  expect((await db`select status from app.prayer_requests where body = ${text}`)[0].status).toBe("prayed");
});

test("testimonies can only be published with the member's consent", async ({ page }) => {
  const privateText = unique("Keep this between me and the pastors");
  const sharedText = unique("God healed my mother this year");
  await db`
    insert into app.testimonies (client_submission_id, kind, body, share_consent) values
      (gen_random_uuid(), 'testimony', ${privateText}, false),
      (gen_random_uuid(), 'thanksgiving', ${sharedText}, true)`;
  await signIn(page);
  await page.goto("/admin/testimonies");
  const privateItem = page.getByRole("listitem").filter({ hasText: privateText });
  await expect(privateItem.getByRole("button", { name: "Publish" })).toHaveCount(0);
  await expect(privateItem.getByText("Can’t be published")).toBeVisible();

  await page.getByRole("listitem").filter({ hasText: sharedText }).getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Published" })).toBeVisible();
  await page.goto("/testimonies");
  await expect(page.getByText(sharedText)).toBeVisible();
  await expect(page.getByText(privateText)).toHaveCount(0);
});

test("services: create one and make it live", async ({ page }) => {
  const title = unique("Youth Night");
  await signIn(page);
  await page.goto("/admin/sessions");
  await page.getByLabel("Type").selectOption("youth");
  await page.getByLabel("Name").fill(title);
  await page.getByRole("button", { name: "Create service" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Service created and now live" })).toBeVisible();
  const active = await db`select title from app.service_sessions where status = 'active'`;
  expect(active.map((r) => r.title)).toEqual([title]);
  await page.goto("/");
  await expect(page.getByText(title)).toBeVisible();
});

test("live Q&A puts only the chosen public question on the projector", async ({ page, context }) => {
  const [question] = await db`
    select id, body from app.questions where visibility = 'public' and archived_at is null order by support_count desc limit 1`;
  await signIn(page);
  const display = await context.newPage();
  await display.goto("/admin/present");
  await page.goto("/admin/live?scope=all");
  await page.getByRole("listitem").filter({ hasText: question.body }).getByRole("button", { name: "Show" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Now on screen" })).toBeVisible();
  await expect(display.getByText(question.body)).toBeVisible({ timeout: 8000 });

  await page.getByRole("button", { name: "Show QR" }).click();
  await expect(display.getByRole("img", { name: /QR code linking to/ })).toBeVisible({ timeout: 8000 });
  await expect(display.getByText(question.body)).toHaveCount(0);
});

test("the QR code download points at the configured site address", async ({ page }) => {
  await signIn(page);
  await page.goto("/admin/qr");
  await expect(page.getByText("localhost:3200").first()).toBeVisible();
  const response = await page.request.get("/api/qr?format=png");
  expect(response.status()).toBe(200);
  const png = PNG.sync.read(Buffer.from(await response.body()));
  expect(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data).toBe("http://localhost:3200");
});

test("signing out ends the admin session", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: /Sign out/ }).first().click();
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
});
