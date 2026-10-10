"use client";
import Link from "next/link";
import { useAccount } from "@/lib/account";

export function AccountChip() {
  const { status, address } = useAccount();
  if (status !== "ready" || !address) return <Link href="/me">Sign in</Link>;
  return <Link href="/me">My record</Link>;
}
