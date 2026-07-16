import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { LocaleProvider, LOCALE_INIT_SCRIPT } from "@/components/LocaleProvider";
import { SiteNavigation } from "@/components/SiteNavigation";
import { SiteFooter } from "@/components/SiteFooter";
import { THEME_INIT_SCRIPT } from "@/components/ThemeToggle";
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
        <script dangerouslySetInnerHTML={{ __html: LOCALE_INIT_SCRIPT }} />
        <LocaleProvider>
          <SiteNavigation />
        {/* Each page adds its own bottom padding to clear the fixed SiteFooter;
            keeping it out of <main> avoids a bg-coloured strip under pages whose
            brand background is a min-h-screen layer. */}
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </LocaleProvider>
      </body>
    </html>
  );
}
