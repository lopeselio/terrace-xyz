/**
 * Email sign-in through Privy, kept behind a flag: Mera passkeys stay the main door.
 *
 * Privy's hooks only work inside its provider, which is only mounted when the flag is on, so the
 * <EmailBridge> component registers what we need here and the account code calls it from outside React.
 */
import type { Address, Hex } from "viem";
import { ADDR } from "./contracts";

export const emailSignInEnabled = () =>
  process.env.NEXT_PUBLIC_EMAIL_SIGNIN === "1" && Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID) && Boolean(ADDR.vault);

export type TypedData = {
  domain: { name: string; version: string; chainId: number; verifyingContract: Address };
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
};

export type EmailBridge = {
  /** The signed-in email, if Privy has a session on this device. */
  email: () => string | null;
  sendCode: (email: string) => Promise<void>;
  loginWithCode: (code: string) => Promise<void>;
  /** The embedded wallet's address, waiting for Privy to create it after a first login. */
  wallet: () => Promise<Address>;
  signMessage: (message: string) => Promise<Hex>;
  signTypedData: (data: TypedData) => Promise<Hex>;
  logout: () => Promise<void>;
};

let bridge: EmailBridge | null = null;

export function setEmailBridge(b: EmailBridge | null) {
  bridge = b;
}

export function emailBridge(): EmailBridge {
  if (!bridge) throw new Error("Email sign-in isn't available here.");
  return bridge;
}

export const hasEmailBridge = () => bridge !== null;
