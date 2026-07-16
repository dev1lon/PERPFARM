import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { ThemeToggle, THEME_INIT_SCRIPT } from "@/components/ThemeToggle";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "PERPFARM",
  description: "Cost-per-point optimizer for tokenless perp DEXes",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${jakarta.variable} ${jetbrainsMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col bg-bg text-text-primary antialiased">
        {/* Applies the stored theme before content paints (no flash). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <header className="border-b border-border">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
            <Link href="/" className="text-sm font-bold tracking-wide text-text-primary">
              PERPFARM
            </Link>
            <nav className="flex items-center gap-1">
              <Link
                href="/methodology"
                className="pf-transition rounded-md px-3 py-1.5 text-sm text-text-muted hover:bg-surface-2 hover:text-text-primary"
              >
                Methodology
              </Link>
              <ThemeToggle />
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
