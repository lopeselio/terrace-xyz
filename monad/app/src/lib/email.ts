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

/**
 * Inside the Telegram Mini App, a fan who linked their Telegram to their email sign-in is signed in with no
 * code (Privy's seamless Telegram login). Needs Telegram set up in the Privy dashboard first, hence its own flag.
 */
export const telegramSignInEnabled = () => emailSignInEnabled() && process.env.NEXT_PUBLIC_TELEGRAM_SIGNIN === "1";

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
  /** The embedded wallet's address if it's already loaded; never creates one. */
  walletNow: () => Address | null;
  signMessage: (message: string) => Promise<Hex>;
  signTypedData: (data: TypedData) => Promise<Hex>;
  logout: () => Promise<void>;
  /** Sign in to an existing Privy user from Telegram's launch data (no code, never a new sign-up). */
  loginTelegram: () => Promise<void>;
  /** Link this Telegram to the signed-in Privy user, from the Mini App's launch data. */
  linkTelegram: (initDataRaw: string) => Promise<void>;
  /** Whether the signed-in Privy user has a Telegram linked. */
  hasTelegram: () => boolean;
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
