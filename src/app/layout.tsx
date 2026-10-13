import type { Metadata, Viewport } from "next";
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
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#12141c" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
