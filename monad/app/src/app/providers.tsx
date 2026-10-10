"use client";
import { AccountProvider } from "@/lib/account";

export function Providers({ children }: { children: React.ReactNode }) {
  return <AccountProvider>{children}</AccountProvider>;
}
