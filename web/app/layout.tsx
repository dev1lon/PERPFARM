import type { Metadata } from "next";
import { Fira_Sans, Fira_Sans_Condensed } from "next/font/google";
import { LocaleProvider, LOCALE_INIT_SCRIPT } from "@/components/LocaleProvider";
import { SiteFooter } from "@/components/SiteFooter";
import { THEME_INIT_SCRIPT } from "@/components/ThemeToggle";
import "./globals.css";
// Dev-only annotation toolbar: click an element on the page, leave a note, and
// the agent receives it with the selector and file behind it. The NODE_ENV
// guard keeps it out of the production bundle entirely.
import { Agentation } from "agentation";

/**
 * One family, two cuts.
 *
 * The condensed cut carries every figure: narrowness buys column width that no
 * proportional face gives back, which is what a table of a hundred costs needs.
 * Fira specifically because it sets Cyrillic -- the interface is English-only
 * today, but the strings for both languages are still in the source, and a face
 * without those glyphs falls back mid-sentence to whatever the OS has.
 */
const firaSans = Fira_Sans({
  variable: "--font-body",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
});

/** Reached through `.font-mono-num`. Despite that class name, kept so hundreds
 *  of existing call sites did not need a sweep, there is no monospace here. */
const firaSansCondensed = Fira_Sans_Condensed({
  variable: "--font-chart",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "PERPFARM",
  description: "Cost-per-point optimizer for tokenless perp DEXes",
  icons: { icon: "/icon.svg" },
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
      className={`${firaSans.variable} ${firaSansCondensed.variable} h-full`}
    >
      <body className="pf-v2 min-h-full flex flex-col bg-bg text-text-primary antialiased">
        {/* Applies the stored theme before content paints (no flash). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: LOCALE_INIT_SCRIPT }} />
        <LocaleProvider>
        {/* Each page ships its own SiteHeaderV2 and adds bottom padding to clear
            the fixed SiteFooter. */}
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </LocaleProvider>
        {process.env.NODE_ENV === "development" && <Agentation />}
      </body>
    </html>
  );
}
