import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./utils";

// Antes de este cambio el sidebar usaba `hidden md:flex`: por debajo de
// 768px no existia ninguna forma de navegar el panel. Este test confirma
// que el menu movil (hamburguesa + drawer) lo resuelve — una sola sesion,
// cambiando el viewport en vivo, para no repetir el login real.
test("el menu se adapta entre escritorio y movil en la misma sesion", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await loginAsAdmin(page);

  await expect(page.locator("aside")).toBeVisible();
  await expect(page.getByRole("button", { name: "Abrir menu" })).toBeHidden();

  await page.setViewportSize({ width: 375, height: 812 }); // iPhone-sized

  await expect(page.locator("aside")).toBeHidden();
  const trigger = page.getByRole("button", { name: "Abrir menu" });
  await expect(trigger).toBeVisible();
  await trigger.click();

  const mobileNav = page.locator('[role="dialog"]');
  await expect(mobileNav.getByRole("link", { name: "Conductores" })).toBeVisible();

  await mobileNav.getByRole("link", { name: "Vehiculos" }).click();
  await page.waitForURL("**/vehicles");
  await expect(page.getByRole("heading", { name: "Vehiculos" })).toBeVisible();
  await expect(mobileNav).toBeHidden();
});
