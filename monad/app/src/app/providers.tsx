"use client";
import dynamic from "next/dynamic";
import { AccountProvider } from "@/lib/account";
import { emailSignInEnabled } from "@/lib/email";

// Privy is heavy and only needed for email sign-in, so it loads only when that's switched on.
const EmailBridge = dynamic(() => import("@/components/EmailBridge"), { ssr: false });

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AccountProvider>
      {emailSignInEnabled() && <EmailBridge />}
      {children}
    </AccountProvider>
  );
}
