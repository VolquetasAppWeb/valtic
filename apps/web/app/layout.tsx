import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { QueryProvider } from "@/lib/query-provider";
import { THEME_STORAGE_KEY } from "@/stores/theme-store";

export const metadata: Metadata = {
  title: "VALTIC",
  description: "Plataforma digital de control operativo para flotas de volquetas",
};

// Fija data-theme antes del primer pintado para evitar el parpadeo de tema
// (FOUC) al cargar o refrescar; debe ejecutarse antes que cualquier CSS lo
// necesite, por eso usa strategy="beforeInteractive".
const themeInitScript = `
(function () {
  try {
    var raw = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var theme = raw ? JSON.parse(raw).state.theme : "system";
    if (theme === "dark" || theme === "light") {
      document.documentElement.setAttribute("data-theme", theme);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <html lang="es">
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
      </head>
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
