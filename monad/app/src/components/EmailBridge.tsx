"use client";
import { PrivyProvider, useCreateWallet, useLoginWithEmail, useLogout, usePrivy, useSignMessage, useSignTypedData, useWallets } from "@privy-io/react-auth";
import { useEffect, useRef } from "react";
import type { Address, Hex } from "viem";
import { chain } from "@/lib/chain";
import { setEmailBridge, type TypedData } from "@/lib/email";

// Privy's own screens stay hidden: Terrace draws the email and code steps, and signing is silent.
const silent = { uiOptions: { showWalletUIs: false } };

/**
 * Mounts Privy (email sign-in only) beside the app and hands its functions to lib/email.ts. Nothing
 * else in the app touches Privy, so it needn't wrap the tree, and it loads only when the flag is on.
 */
export default function EmailBridge() {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        loginMethods: ["email"],
        // Privy only auto-creates wallets for its own login modal; our email screens create it in wallet() below.
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" }, showWalletUIs: false },
        defaultChain: chain,
        supportedChains: [chain],
      }}
    >
      <Bridge />
    </PrivyProvider>
  );
}

function Bridge() {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const { sendCode, loginWithCode } = useLoginWithEmail();
  const { signMessage } = useSignMessage();
  const { signTypedData } = useSignTypedData();
  const { logout } = useLogout();
  const { createWallet } = useCreateWallet();

  // Hooks hand back new functions each render; the bridge reads the latest through refs.
  const live = useRef({ user, wallets, sendCode, loginWithCode, signMessage, signTypedData, logout, createWallet });
  live.current = { user, wallets, sendCode, loginWithCode, signMessage, signTypedData, logout, createWallet };

  useEffect(() => {
    const embedded = () => live.current.wallets.find((w) => w.walletClientType === "privy")?.address as Address | undefined;
    setEmailBridge({
      email: () => live.current.user?.email?.address ?? null,
      sendCode: (email) => live.current.sendCode({ email }),
      loginWithCode: (code) => live.current.loginWithCode({ code }),
      wallet: async () => {
        const pause = () => new Promise((r) => setTimeout(r, 250));
        // Right after the code is accepted, React may not have handed us the Privy user yet.
        for (let i = 0; i < 20 && !live.current.user; i++) await pause();
        // A first email login has no wallet yet (Privy only auto-creates one from its own modal).
        const hasOne = live.current.user?.linkedAccounts.some((a) => a.type === "wallet" && a.walletClientType === "privy");
        if (!hasOne) {
          try {
            return (await live.current.createWallet()).address as Address;
          } catch {
            // Already has one after all: fall through and wait for it to load.
          }
        }
        for (let i = 0; i < 40; i++) {
          const address = embedded();
          if (address) return address;
          await pause();
        }
        throw new Error("Privy didn't load the email wallet in time.");
      },
      walletNow: () => embedded() ?? null,
      signMessage: async (message) => (await live.current.signMessage({ message }, { ...silent, address: embedded() })).signature as Hex,
      signTypedData: async (data: TypedData) =>
        (await live.current.signTypedData(data as never, { ...silent, address: embedded() })).signature as Hex,
      logout: () => live.current.logout(),
    });
    return () => setEmailBridge(null);
  }, []);

  return null;
}
