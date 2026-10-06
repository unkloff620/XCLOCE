import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Rubik, Russo_One } from "next/font/google";
import "./globals.css";
import "./screens.css";

const body = Rubik({ subsets: ["latin", "cyrillic"], weight: ["400", "500", "700", "800"], variable: "--font-body", display: "swap" });
const display = Russo_One({ subsets: ["latin", "cyrillic"], weight: "400", variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "XCLOSE",
  description: "Корпоративная игра: бей боссов администрации оружием, проходи локации, собирай двор.",
  icons: { icon: "/icon.svg" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: "cover", themeColor: "#0c0e1c" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${body.variable} ${display.variable}`}>
      <body>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
