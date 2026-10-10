import "server-only";
import { createPublicClient, createWalletClient, fallback, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain } from "../chain";

/** Servers go through Alchemy first and fall back to the public RPC, keeping its rate limit for fans' browsers. */
export function serverTransport() {
  const alchemy = process.env.ALCHEMY_API_KEY ? [http(`https://monad-testnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`)] : [];
  return fallback([...alchemy, http("https://testnet-rpc.monad.xyz")]);
}

export const serverClient = createPublicClient({ chain, transport: serverTransport() });

export function treasury() {
  const key = process.env.ONBOARDING_PRIVATE_KEY as Hex | undefined;
  if (!key) throw new Error("ONBOARDING_PRIVATE_KEY is not set");
  const account = privateKeyToAccount(key);
  return { account, wallet: createWalletClient({ account, chain, transport: serverTransport() }) };
}
