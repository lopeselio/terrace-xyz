"use client";
import { play } from "./sound";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createWalletClient, http, type Abi, type Address, type ContractFunctionArgs, type ContractFunctionName, type Hex } from "viem";
import { chain, publicClient } from "./chain";
import { ADDR } from "./contracts";
import { emailBridge, hasEmailBridge } from "./email";
import { confirmPresence, createAccount, createPasskeyUnlocker, friendlyPasskeyError, newRoot, openRoot, PROMPT_FREE_LIMIT, sessionLive, signIn, signOut, wrapOpenRoot, type Keys } from "./mera";
import { friendlyError, FanError } from "./errors";
import { KIND, linkTypedData, readEntry, signInsOf, unwrapRoot, vaultAbi, WRAP_MESSAGE, wrapKeyFromSignature } from "./vault";

type Status = "signed-out" | "signing-in" | "ready";
type Method = "passkey" | "email";
type Call = { address: Address; abi: Abi; functionName: string; args: readonly unknown[]; dollars?: number };

/** The email sign-in as a vault unlocker. `check` signs twice to be sure the wrap key comes out the same every time. */
async function emailUnlocker(check = false) {
  const b = emailBridge();
  const address = await b.wallet();
  const signature = await b.signMessage(WRAP_MESSAGE);
  if (check && (await b.signMessage(WRAP_MESSAGE)) !== signature) {
    throw new FanError("This email sign-in can't hold a Terrace key on this device. Keep using Face ID.");
  }
  return { address, wrapKey: wrapKeyFromSignature(signature) };
}

/** The root an email sign-in unlocks, or null if this email hasn't been linked to an account yet. */
async function rootFromEmail(): Promise<{ root: Uint8Array; account: Address } | null> {
  const { address, wrapKey } = await emailUnlocker();
  const entry = await readEntry(address);
  return entry ? { root: unwrapRoot(entry.wrapped, wrapKey, entry.account), account: entry.account } : null;
}

async function emailAgain(): Promise<Uint8Array> {
  const found = await rootFromEmail();
  if (!found) throw new FanError("That email isn't linked to a Terrace account any more.");
  return found.root;
}

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
  /** How this session signed in. */
  method: Method | null;
  /** After the email code is accepted: open that email's account, or start a new one. */
  loginEmail: () => Promise<Keys | null>;
  /** Let the email that just passed its code open this account too. */
  linkEmail: () => Promise<void>;
  /** Add a Face ID passkey to an account that started with email. */
  addPasskey: () => Promise<void>;
};

const AccountContext = createContext<Ctx | null>(null);

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [keys, setKeys] = useState<Keys | null>(null);
  const [status, setStatus] = useState<Status>("signed-out");
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<Method | null>(null);

  const finish = useCallback(async (run: () => Promise<Keys>, via: Method = "passkey") => {
    setStatus("signing-in");
    setError(null);
    try {
      const k = await run();
      setKeys(k);
      setMethod(via);
      setStatus("ready");
      // Gas and starting dollars for new fans; a no-op for anyone already topped up.
      fetch("/api/onboard", { method: "POST", body: JSON.stringify({ address: k.account.address }) }).catch(() => {});
      try {
        // Only UI hints, nothing secret: the intro is done here, and whether to offer the passkey first.
        localStorage.setItem("terrace.signedInHere", "1");
        if (via === "passkey") localStorage.setItem("terrace.hasPasskey", "1");
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
    if (hasEmailBridge()) emailBridge().logout().catch(() => {});
    setKeys(null);
    setMethod(null);
    setStatus("signed-out");
  }, []);

  useEffect(() => () => signOut(), []);

  const sendWith = useCallback(async (start: Keys, call: Call): Promise<Hex> => {
      let k = start;
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
        if (process.env.NODE_ENV !== "production") console.error("[send]", call.functionName, e);
        throw e instanceof FanError ? e : new FanError(friendlyError(e) + (process.env.NODE_ENV !== "production" && e instanceof Error ? ` (${e.message.slice(0, 200)})` : ""));
      }
      } finally {
        window.dispatchEvent(new CustomEvent("terrace-busy", { detail: -1 }));
      }
  }, []);

  const send: Ctx["send"] = useCallback(
    async (call) => {
      if (!keys) throw new FanError("Sign in to save this.");
      return sendWith(keys, call as Call);
    },
    [keys, sendWith],
  );

  /**
   * Store this account's root in the vault under `unlocker`, which signs the Link to agree. From a
   * passkey session we also note the account has a passkey, which the vault can't otherwise see.
   */
  const linkUnlocker = useCallback(
    async (
      k: Keys,
      unlocker: Address,
      kind: number,
      fromPasskey: boolean,
      wrapKey: Uint8Array,
      signLink: (data: Awaited<ReturnType<typeof linkTypedData>>) => Promise<Hex>,
    ) => {
      const me = k.account.address;
      const wrapped = wrapOpenRoot(wrapKey, me);
      const unlockerSig = await signLink(await linkTypedData(unlocker, me, wrapped));
      await sendWith(k, { address: ADDR.vault!, abi: vaultAbi, functionName: "link", args: [unlocker, kind, wrapped, unlockerSig, fromPasskey] });
      window.dispatchEvent(new Event("terrace-signins")); // Profile refreshes its list
    },
    [sendWith],
  );

  const loginEmail = useCallback(
    () =>
      finish(async () => {
        const found = await rootFromEmail();
        if (found) {
          const k = openRoot(found.root, emailAgain);
          if (k.account.address.toLowerCase() !== found.account.toLowerCase()) throw new FanError("That email's Terrace key didn't match. Try again.");
          return k;
        }
        // A new fan starting with email: a fresh root, linked to this email before they can play,
        // because the vault is the only place this account can come back from.
        const { address, wrapKey } = await emailUnlocker(true);
        const k = openRoot(newRoot(), emailAgain);
        await linkUnlocker(k, address, KIND.email, false, wrapKey, (data) => emailBridge().signTypedData(data));
        return k;
      }, "email"),
    [finish, linkUnlocker],
  );

  const linkEmail = useCallback(async () => {
    if (!keys) throw new FanError("Sign in first.");
    const { address, wrapKey } = await emailUnlocker(true);
    const entry = await readEntry(address);
    if (entry && entry.account.toLowerCase() === keys.account.address.toLowerCase()) return; // already linked
    if (entry) {
      // The email opens another account. Move it here (the vault allows that once the email signs), unless
      // that would strand an account that's been used and has no other way in.
      const [sent, other] = await Promise.all([publicClient.getTransactionCount({ address: entry.account }), signInsOf(entry.account)]);
      const unused = sent <= 1; // an email sign-up's only transaction is its own vault link
      if (!unused && !other.passkey && other.emails.length <= 1) {
        throw new FanError("That email opens another Terrace account with bets on it. Sign in with that email to keep using it.");
      }
    }
    await linkUnlocker(keys, address, KIND.email, method === "passkey", wrapKey, (data) => emailBridge().signTypedData(data));
  }, [keys, method, linkUnlocker]);

  const addPasskey = useCallback(async () => {
    if (!keys) throw new FanError("Sign in first.");
    try {
      const { signer, wrapKey } = await createPasskeyUnlocker();
      await linkUnlocker(keys, signer.address, KIND.passkey, false, wrapKey, (data) => signer.signTypedData(data));
      localStorage.setItem("terrace.hasPasskey", "1");
    } catch (e) {
      throw e instanceof FanError ? e : new FanError(friendlyPasskeyError(e));
    }
  }, [keys, linkUnlocker]);

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
    () => ({ status, keys, address: keys?.account.address ?? null, error, join, login, loginFrom, logout, send, sign, method, loginEmail, linkEmail, addPasskey }),
    [status, keys, error, join, login, loginFrom, logout, send, sign, method, loginEmail, linkEmail, addPasskey],
  );
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): Ctx {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount must be used inside AccountProvider");
  return ctx;
}
