import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { LocaleProvider, LOCALE_INIT_SCRIPT } from "@/components/LocaleProvider";
import { SiteFooter } from "@/components/SiteFooter";
import { THEME_INIT_SCRIPT } from "@/components/ThemeToggle";
import "./globals.css";
// Dev-only annotation toolbar: click an element on the page, leave a note, and
// the agent receives it with the selector and file behind it. The NODE_ENV
// guard keeps it out of the production bundle entirely.
import { Agentation } from "agentation";

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
      className={`${jakarta.variable} ${jetbrainsMono.variable} h-full`}
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
