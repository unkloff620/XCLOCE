import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Caveat, Rubik } from "next/font/google";
import "./globals.css";
import "./screens.css";

// one font everywhere (the user 2026-11-22: as on the rewards): the text — Rubik regular and medium only (whatever asks
// for bold gets medium, globals.css font-synthesis: none); the titles and the buttons (--font-display) — Rubik semibold
const body = Rubik({ subsets: ["latin", "cyrillic"], weight: ["400", "500"], variable: "--font-body", display: "swap" });
const display = Rubik({ subsets: ["latin", "cyrillic"], weight: "600", variable: "--font-display", display: "swap" });
// handwriting: what is written by pen on the newspaper of a new level (client/levelup.tsx)
const hand = Caveat({ subsets: ["latin", "cyrillic"], weight: ["600", "700"], variable: "--font-hand", display: "swap" });

export const metadata: Metadata = {
  title: "XCLOSE",
  description: "Корпоративная игра: бей боссов администрации оружием, проходи локации, собирай двор.",
  icons: { icon: "/icon.svg" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: "cover", themeColor: "#0c0e1c" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${body.variable} ${display.variable} ${hand.variable}`}>
      <body>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
