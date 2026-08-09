import type { Page } from "@playwright/test";

export const ADMIN_EMAIL = "admin@contratistademo.com";
export const ADMIN_PASSWORD = "AdminDemo123!";
export const DISPATCHER_EMAIL = "despachador@contratistademo.com";
export const DISPATCHER_PASSWORD = "Despacho123!";
export const DRIVER_DOCUMENT = "1020304050";
export const DRIVER_PIN = "123456";

async function loginAsAdminActor(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL("**/dashboard");
}

export async function loginAsAdmin(page: Page): Promise<void> {
  await loginAsAdminActor(page, ADMIN_EMAIL, ADMIN_PASSWORD);
}

export async function loginAsDispatcher(page: Page): Promise<void> {
  await loginAsAdminActor(page, DISPATCHER_EMAIL, DISPATCHER_PASSWORD);
}

export async function loginAsDriver(page: Page): Promise<void> {
  await page.goto("/driver/login");
  await page.locator("#documentOrPhone").fill(DRIVER_DOCUMENT);
  for (const digit of DRIVER_PIN) {
    await page.getByRole("button", { name: digit, exact: true }).click();
  }
  await page.waitForURL("**/driver");
}
