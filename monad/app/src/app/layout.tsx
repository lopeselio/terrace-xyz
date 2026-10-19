import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import { TerraceMark } from "@/components/TerraceMark";
import { Activity } from "@/components/Activity";
import { Onboarding } from "@/components/Onboarding";
import { GameweekPopup } from "@/components/GameweekPopup";
import { OutcomePopup } from "@/components/OutcomePopup";
import { StoppagePopup } from "@/components/Stoppage";
import { PointsToast } from "@/components/PointsToast";
import { TabBar } from "@/components/TabBar";
import { SideNav } from "@/components/SideNav";
import { LAYOUT_BOOT } from "@/lib/layout";
import { Providers } from "./providers";
import "./globals.css";

const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-barlow" });
const barlowCond = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-barlow-cond" });

export const metadata: Metadata = {
  title: "Terrace",
  description: "Back your take. Chat the match, back your calls with test dollars, run leagues with your mates.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  appleWebApp: { capable: true, title: "Terrace", statusBarStyle: "black-translucent" },
  icons: { icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }, { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }], apple: "/icons/icon-192.png" },
  openGraph: { type: "website", siteName: "Terrace", title: "Terrace · Back your take", description: "The group chat for football calls. Post your take, your mates back it or fade it, and the table settles the argument. Free to play.", url: "/" },
  twitter: { card: "summary_large_image", title: "Terrace · Back your take", description: "The group chat for football calls. Post your take, your mates back it or fade it, and the table settles the argument. Free to play." },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCond.variable}`} suppressHydrationWarning>
      <head>
        {/* Apply the saved theme and layout before first paint (dark and auto are the defaults). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("terrace.theme")||"dark";if(t==="system")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
        <script dangerouslySetInnerHTML={{ __html: LAYOUT_BOOT }} />
      </head>
      <body>
        <Providers>
          <div className="splash" aria-hidden>
            <span className="logo" style={{ flexDirection: "column", gap: 14 }}>
              <TerraceMark size={56} />
              <span className="logo-word" style={{ fontSize: 26 }}>Terrace</span>
            </span>
            <span className="bar"><i /></span>
          </div>
          <SideNav />
          <div className="app">
            <main className="page">{children}</main>
          </div>
          <TabBar />
          <Activity />
          <Onboarding />
          <OutcomePopup />
          <GameweekPopup />
          <PointsToast />
          <StoppagePopup />
        </Providers>
      </body>
    </html>
  );
}
