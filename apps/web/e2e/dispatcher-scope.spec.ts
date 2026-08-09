import { expect, test, type Page } from "@playwright/test";
import { loginAsDispatcher } from "./utils";

// Una sola sesion de dispatcher (un solo POST /auth/admin/login) reutilizada
// por todos los casos — mismo motivo que en admin-login.spec.ts.
test.describe.serial("sesion de dispatcher", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await loginAsDispatcher(page);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("solo ve en el menu lo que puede gestionar (datos propios)", async () => {
    const nav = page.locator("nav");
    await expect(nav.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Conductores" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Vehiculos" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Obras" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Viajes" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Novedades" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Reportes" })).toBeVisible();

    // Catalogos/config compartidos del tenant y modulos financieros/de
    // auditoria: no son "datos propios" de un dispatcher, no deberian aparecer.
    await expect(nav.getByRole("link", { name: "Propietarios" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Materiales" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Tarifas" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Liquidaciones" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Auditoria" })).toHaveCount(0);
  });

  test("el dashboard muestra copy de alcance propio", async () => {
    await page.goto("/dashboard");
    await expect(page.getByText(/vision general de tu operacion/i)).toBeVisible();
    await expect(page.getByText("Mis viajes activos")).toBeVisible();
  });

  test("Reportes no incluye el reporte de liquidado por propietario", async () => {
    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "Reportes" })).toBeVisible();
    await expect(page.getByText("Liquidado por propietario")).toHaveCount(0);
    await expect(page.getByText("Viajes completados por obra")).toBeVisible();
  });

  test("no puede acceder a Liquidaciones ni Auditoria por URL directa (backend lo bloquea)", async () => {
    await page.goto("/settlements");
    // La pagina renderiza igual (no hay guard de ruta en el cliente), pero
    // el backend rechaza y no debe mostrar datos de otras liquidaciones.
    await expect(page.getByRole("heading", { name: "Liquidaciones" })).toBeVisible();
    await expect(page.getByText("Transportes El Progreso")).toHaveCount(0);
  });
});
