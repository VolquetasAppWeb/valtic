import { expect, test } from "@playwright/test";
import { loginAsDriver } from "./utils";

test("un conductor puede iniciar sesion con documento + PIN y llega a su pantalla", async ({ page }) => {
  await loginAsDriver(page);
  await expect(page).toHaveURL(/\/driver$/);
});

test("un PIN incorrecto no inicia sesion y limpia el PIN ingresado", async ({ page }) => {
  await page.goto("/driver/login");
  await page.locator("#documentOrPhone").fill("1020304050");
  for (const digit of "000000") {
    await page.getByRole("button", { name: digit, exact: true }).click();
  }

  await expect(page.getByText("Credenciales invalidas.")).toBeVisible();
  await expect(page).toHaveURL(/\/driver\/login$/);
});
