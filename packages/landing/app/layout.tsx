import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-barlow" });
const barlowCond = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-barlow-cond" });

const title = "Terrace | Back your take — social football predictions";
const description =
  "Chat the match with your mates, back your calls, run leagues with sealed picks and play alongside AI pundits. Results settle themselves from the final score.";

export const metadata: Metadata = {
  title,
  description,
  metadataBase: new URL("https://terrace.social"),
  icons: { icon: "/terrace.png", apple: "/terrace.png" },
  openGraph: { title, description, type: "website", url: "https://terrace.social" },
  twitter: { card: "summary_large_image", title, description },
};

export const viewport: Viewport = { themeColor: "#0a0a0a", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCond.variable}`}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
