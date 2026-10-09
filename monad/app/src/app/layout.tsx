import type { Metadata, Viewport } from "next";
import { Big_Shoulders, Figtree } from "next/font/google";
import Link from "next/link";
import { Providers } from "./providers";
import "./globals.css";

const display = Big_Shoulders({ subsets: ["latin"], weight: ["700", "900"], variable: "--font-display" });
const body = Figtree({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Terrace",
  description: "Predict the scores. Beat your mates. Keep your record.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  appleWebApp: { capable: true, title: "Terrace", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#7A1F3D",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <Providers>
          <header className="topbar">
            <Link href="/" className="wordmark">Terrace</Link>
            <nav>
              <Link href="/new">New challenge</Link>
              <Link href="/me">My record</Link>
            </nav>
          </header>
          <main className="page">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
