import { expect, type Page } from "@playwright/test";
import postgres from "postgres";

export const ADMIN = { email: "admin@connect-ask.local", password: "local-admin-password" };
export const MODERATOR = { email: "moderator@connect-ask.local", password: "local-moderator-password" };

/** Direct access to the e2e test database, for verifying what was really saved. */
export function testDb() {
  return postgres("postgres://postgres:postgres@127.0.0.1:54532/postgres", { max: 2, onnotice: () => {} });
}

export async function signIn(page: Page, who = ADMIN) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

export function unique(label: string) {
  return `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export async function submitQuestion(page: Page, text: string) {
  await page.goto("/ask");
  await page.getByLabel("Your question").fill(text);
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.getByRole("heading", { name: "Your question was received." })).toBeVisible();
}
