import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Terrace — Social Sports Predictions on Solana",
  description:
    "The on-chain prediction layer for football fans. Create markets, back your takes, build your rep. Powered by Solana.",
  openGraph: {
    title: "Terrace — Social Sports Predictions on Solana",
    description:
      "Create markets, back your takes, build your on-chain reputation. The social prediction layer football deserves.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Terrace — Social Sports Predictions on Solana",
    description:
      "Create markets, back your takes, build your on-chain reputation.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
