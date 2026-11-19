"use client";
import dynamic from "next/dynamic";
import { AccountProvider } from "@/lib/account";
import { emailSignInEnabled, telegramSignInEnabled } from "@/lib/email";
import { TelegramSignIn } from "@/components/TelegramSignIn";

// Privy is heavy and only needed for email sign-in, so it loads only when that's switched on.
const EmailBridge = dynamic(() => import("@/components/EmailBridge"), { ssr: false });

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AccountProvider>
      {emailSignInEnabled() && <EmailBridge />}
      {telegramSignInEnabled() && <TelegramSignIn />}
      {children}
    </AccountProvider>
  );
}
