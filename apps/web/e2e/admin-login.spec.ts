import { expect, test, type Page } from "@playwright/test";
import { ADMIN_EMAIL, loginAsAdmin } from "./utils";

test("credenciales invalidas muestran un error y no navegan fuera del login", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#email").fill(ADMIN_EMAIL);
  await page.locator("#password").fill("ContrasenaIncorrecta123!");
  await page.getByRole("button", { name: "Ingresar" }).click();

  await expect(page.getByText("Credenciales invalidas.")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

// Una sola sesion de administrador (un solo POST /auth/admin/login) reutilizada
// por todos los casos de esta serie — evita el rate limit del endpoint de
// login (5/60s) al no repetir el login real por cada asercion.
test.describe.serial("sesion de administrador", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAsAdmin(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("llega al dashboard con datos reales", async () => {
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    // KPI "Viajes activos" viene del seed: 2 viajes activos (ASSIGNED + LOADING).
    await expect(page.getByText("Viajes activos")).toBeVisible();
  });

  test("ve el menu completo, incluyendo lo exclusivo de TENANT_ADMIN", async () => {
    const nav = page.locator("nav");
    await expect(nav.getByRole("link", { name: "Propietarios" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Materiales" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Tarifas" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Liquidaciones" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Auditoria" })).toBeVisible();
  });

  test("puede navegar a Liquidaciones y ve la liquidacion del seed", async () => {
    await page.goto("/settlements");
    await expect(page.getByRole("heading", { name: "Liquidaciones" })).toBeVisible();
    await expect(page.getByText("Transportes El Progreso")).toBeVisible();
  });

  test("la pantalla de Auditoria carga eventos reales", async () => {
    await page.goto("/audit");
    await expect(page.getByRole("heading", { name: "Auditoria" })).toBeVisible();
    await expect(page.getByText("AUTH_LOGIN_SUCCESS").first()).toBeVisible();
  });

  test("logout regresa al login y protege las rutas de administrador", async () => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /cerrar sesion/i }).click();
    await page.waitForURL("**/login");

    await page.goto("/dashboard");
    await page.waitForURL("**/login");
  });
});
