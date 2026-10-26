import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { THEME_INIT_SCRIPT } from "@/components/theme/themeScript";
import { ToastProvider } from "@/components/ui/Toast";
import { inter } from "@/styles/fonts";
import "./globals.css";

const SITE_DESCRIPTION =
  "Track seats. Enroll faster. Real-time seat tracking, grade history, professor ratings and a schedule builder for Georgia State courses.";

export const metadata: Metadata = {
  // Resolves the relative og:image / twitter:image URLs from opengraph-image.tsx.
  metadataBase: new URL(process.env.APP_URL ?? "https://pantherwatch.app"),
  title: { default: "PantherWatch", template: "%s · PantherWatch" },
  description: SITE_DESCRIPTION,
  applicationName: "PantherWatch",
  // Images come from the opengraph-image / twitter-image file conventions.
  openGraph: {
    type: "website",
    siteName: "PantherWatch",
    url: "/",
    title: "PantherWatch",
    description: SITE_DESCRIPTION,
    locale: "en_US",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  // --surface in each theme (tokens.css). ThemeProvider rewrites these to the active theme.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1625" },
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
