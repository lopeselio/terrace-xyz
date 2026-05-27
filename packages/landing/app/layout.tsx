import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Terrace | Social Sports Predictions on Solana",
  description:
    "The social prediction layer for football fans. Create markets, back your takes, build your rep. Powered by Solana.",
  icons: {
    icon: "/terrace-logo.png",
    apple: "/terrace-logo.png",
  },
  openGraph: {
    title: "Terrace | Social Sports Predictions on Solana",
    description:
      "Create markets, back your takes, build your reputation. The social prediction layer football deserves.",
    type: "website",
    images: [{ url: "/terrace-logo.png", width: 512, height: 512 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Terrace | Social Sports Predictions on Solana",
    description:
      "Create markets, back your takes, build your reputation.",
    images: ["/terrace-logo.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
