import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/manrope";
import "./globals.css";
import "./workspace-design.css";
import "./native-workspace.css";
import "./connection-workspace.css";
import "./task-cost-workspace.css";
import "./files-workspace.css";
import "./workspace-refinements.css";
import "./popup-workspace.css";
import "./overview-dashboard.css";
import "./page-proportions.css";
import "./task-date-range.css";
import "./overview-connections.css";
import "./super-app.css";
import "./room-design-tokens.css";
import { Toaster } from "sonner";
import { I18nProvider } from "@/components/i18n-provider";
import { serverLocale } from "@/lib/i18n/server";
import { serverTheme } from "@/lib/server-theme";
import { themeBootstrapScript } from "@/lib/theme";
export const metadata: Metadata = {
  title: {
    default: "Evolve — Every Task Matters",
    template: "%s · Evolve",
  },
  description:
    "RENSIST workspace for power system planning: coordinate tasks, projects, deadlines, and costs.",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fafaf8",
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [locale, theme] = await Promise.all([serverLocale(), serverTheme()]);
  return (
    <html
      lang={locale}
      data-theme={theme === "dark" ? "dark" : "light"}
      data-theme-preference={theme || "system"}
      suppressHydrationWarning
    >
      <head>
        <script
          id="evolve-theme-bootstrap"
          dangerouslySetInnerHTML={{ __html: themeBootstrapScript(theme) }}
        />
      </head>
      <body>
        <I18nProvider initialLocale={locale}>
          {children}
          <Toaster position="bottom-right" richColors closeButton />
        </I18nProvider>
      </body>
    </html>
  );
}
