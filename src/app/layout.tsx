import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Bangers, Russo_One, Inter } from "next/font/google";
import "./globals.css";

const comic = Bangers({ subsets: ["latin"], weight: "400", variable: "--font-comic", display: "swap" });
const display = Russo_One({ subsets: ["latin", "cyrillic"], weight: "400", variable: "--font-display", display: "swap" });
const body = Inter({ subsets: ["latin", "cyrillic"], weight: ["400", "500", "600", "700"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: "XCLOCE — Meme Fighters",
  description: "Прокачивай мем-бойца, бей мем-боссов, собирай клан.",
  icons: { icon: "/assets/ui/logo.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#07090f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${comic.variable} ${display.variable} ${body.variable}`}>
      <body>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
