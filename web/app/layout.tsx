import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import Link from "next/link";
import Script from "next/script";
import { ThemeToggle } from "@/components/ThemeToggle";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "perpfarm",
  description: "Cost-per-point optimizer for tokenless perp DEXes",
};

// Runs before hydration (strategy="beforeInteractive") so the theme is
// correct on first paint -- no flash of the wrong theme. Reads a persisted
// choice first, otherwise falls back to the OS preference.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('pf-theme');
    var theme = stored === 'light' || stored === 'dark'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${jakarta.variable} ${jetbrainsMono.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-bg text-text-primary antialiased">
        <Script id="pf-theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <header className="border-b border-border">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
            <Link href="/" className="text-sm font-bold tracking-wide text-text-primary">
              PERPFARM
            </Link>
            <nav className="flex items-center gap-2">
              <ThemeToggle />
              <Link
                href="/methodology"
                className="pf-transition rounded-md px-3 py-1.5 text-sm text-text-muted hover:bg-surface-2 hover:text-text-primary"
              >
                Methodology
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
