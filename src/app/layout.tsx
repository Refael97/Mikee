import type { Metadata, Viewport } from "next";
import { dirOf } from "@/lib/i18n";
import { getLang } from "@/lib/i18n/server";
import { LangProvider } from "@/components/Lang";
import "./globals.css";

// Every page gets its own script nonce (see middleware.ts), so nothing is prerendered.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mikee",
  description: "איש השיווק של העסק שלך",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f0f" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang} dir={dirOf(lang)}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-dvh">
        <LangProvider lang={lang}>{children}</LangProvider>
      </body>
    </html>
  );
}
