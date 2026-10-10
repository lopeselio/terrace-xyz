import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import Link from "next/link";
import { TabBar } from "@/components/TabBar";
import { Providers } from "./providers";
import "./globals.css";

const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-barlow" });
const barlowCond = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-barlow-cond" });

export const metadata: Metadata = {
  title: "Terrace",
  description: "Back your take. Chat the match, put money on your calls, run leagues with your mates.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  appleWebApp: { capable: true, title: "Terrace", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCond.variable}`}>
      <body>
        <Providers>
          <header className="header">
            <Link href="/" className="wordmark">Terr<span>a</span>ce</Link>
            <span className="spacer" />
            <span className="chain">ON MONAD</span>
          </header>
          <main className="page">{children}</main>
          <TabBar />
        </Providers>
      </body>
    </html>
  );
}
