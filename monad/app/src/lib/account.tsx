"use client";
import { play } from "./sound";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createWalletClient, http, type Abi, type Address, type ContractFunctionArgs, type ContractFunctionName, type Hex } from "viem";
import { chain, publicClient } from "./chain";
import { confirmPresence, createAccount, friendlyPasskeyError, PROMPT_FREE_LIMIT, sessionLive, signIn, signOut, type Keys } from "./mera";
import { friendlyError, FanError } from "./errors";

type Status = "signed-out" | "signing-in" | "ready";

type Ctx = {
  status: Status;
  keys: Keys | null;
  address: Address | null;
  error: string | null;
  join: () => Promise<Keys | null>;
  login: () => Promise<Keys | null>;
  /** Sign in with a passkey made on an older Terrace address (WebAuthn related origins). */
  loginFrom: (home: string) => Promise<Keys | null>;
  logout: () => void;
  /** Sign and send with the Mera session. Pass `dollars` for stakes: big ones ask for the passkey again. */
  send: <const abi extends Abi, fn extends ContractFunctionName<abi, "nonpayable" | "payable">>(call: {
    address: Address;
    abi: abi;
    functionName: fn;
    args: ContractFunctionArgs<abi, "nonpayable" | "payable", fn>;
    dollars?: number;
  }) => Promise<Hex>;
  /** Sign a short plain-text note with the session (no prompt), so our own API knows it's really you. */
  sign: (message: string) => Promise<Hex>;
};

const AccountContext = createContext<Ctx | null>(null);

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [keys, setKeys] = useState<Keys | null>(null);
  const [status, setStatus] = useState<Status>("signed-out");
  const [error, setError] = useState<string | null>(null);

  const finish = useCallback(async (run: () => Promise<Keys>) => {
    setStatus("signing-in");
    setError(null);
    try {
      const k = await run();
      setKeys(k);
      setStatus("ready");
      // Gas and starting dollars for new fans; a no-op for anyone already topped up.
      fetch("/api/onboard", { method: "POST", body: JSON.stringify({ address: k.account.address }) }).catch(() => {});
      try {
        localStorage.setItem("terrace.hasPasskey", "1"); // only a UI hint; nothing secret
      } catch {}
      return k;
    } catch (e) {
      setError(friendlyPasskeyError(e));
      setStatus("signed-out");
      return null;
    }
  }, []);

  const join = useCallback(() => finish(createAccount), [finish]);
  const login = useCallback(() => finish(() => signIn()), [finish]);
  const loginFrom = useCallback((home: string) => finish(() => signIn(undefined, home)), [finish]);
  const logout = useCallback(() => {
    signOut();
    setKeys(null);
    setStatus("signed-out");
  }, []);

  useEffect(() => () => signOut(), []);

  const send: Ctx["send"] = useCallback(
    async (call) => {
      let k = keys;
      if (!k) throw new FanError("Sign in to save this.");
      // Tell the activity indicator something is happening (and when it's done).
      window.dispatchEvent(new CustomEvent("terrace-busy", { detail: 1 }));
      try {
      // Idle too long, or a big stake: one passkey prompt to confirm it's really you.
      if (!sessionLive() || (call.dollars ?? 0) > PROMPT_FREE_LIMIT) {
        k = await confirmPresence(k.account.address);
        setKeys(k);
      }
      const wallet = createWalletClient({ account: k.account, chain, transport: http(process.env.NEXT_PUBLIC_RPC_URL) });
      // Running low on gas? Ask for a top-up first (idempotent; the fan never sees "out of gas").
      if ((await publicClient.getBalance({ address: k.account.address })) < 150_000_000_000_000_000n) {
        await fetch("/api/onboard", { method: "POST", body: JSON.stringify({ address: k.account.address }) }).catch(() => {});
      }
      try {
        // Monad charges the gas limit, not gas used: estimate, then add a small margin only.
        const { request } = await publicClient.simulateContract({
          account: k.account,
          address: call.address,
          abi: call.abi,
          functionName: call.functionName,
          args: call.args,
        } as never);
        const gas = await publicClient.estimateContractGas(request as never);
        const hash = await wallet.writeContract({ ...(request as object), gas: (gas * 115n) / 100n } as never);
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("reverted");
        window.dispatchEvent(new Event("terrace-sent")); // points are on their way
        play("done");
        return hash;
      } catch (e) {
        throw e instanceof FanError ? e : new FanError(friendlyError(e));
      }
      } finally {
        window.dispatchEvent(new CustomEvent("terrace-busy", { detail: -1 }));
      }
    },
    [keys],
  );

  const sign: Ctx["sign"] = useCallback(
    async (message) => {
      let k = keys;
      if (!k) throw new FanError("Sign in first.");
      if (!sessionLive()) {
        k = await confirmPresence(k.account.address);
        setKeys(k);
      }
      return k.account.signMessage({ message });
    },
    [keys],
  );

  const value = useMemo<Ctx>(
    () => ({ status, keys, address: keys?.account.address ?? null, error, join, login, loginFrom, logout, send, sign }),
    [status, keys, error, join, login, loginFrom, logout, send, sign],
  );
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): Ctx {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount must be used inside AccountProvider");
  return ctx;
}
