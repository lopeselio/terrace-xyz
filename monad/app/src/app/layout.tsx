import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { MonadMark } from "@/components/MonadMark";
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
            <Link href="/" className="logo"><span className="mark">T</span><b>Terrace</b></Link>
            <span className="spacer" />
            <span className="chain"><MonadMark size={16} /> MONAD</span>
            <Link href="/social" className="icon-btn" aria-label="What your mates are doing"><Icon name="bell" size={18} /></Link>
          </header>
          <main className="page">{children}</main>
          <TabBar />
        </Providers>
      </body>
    </html>
  );
}
