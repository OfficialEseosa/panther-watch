import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { THEME_INIT_SCRIPT } from "@/components/theme/themeScript";
import { ToastProvider } from "@/components/ui/Toast";
import { inter } from "@/styles/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "PantherWatch", template: "%s · PantherWatch" },
  description:
    "Track Georgia State class seats, get an email the moment one opens, and plan your week.",
  applicationName: "PantherWatch",
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  // --surface in each theme (tokens.css). ThemeProvider rewrites these to the active theme.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#121b2f" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Pre-paint theme (spec.md §1.2.4): must run before first paint, never deferred. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
