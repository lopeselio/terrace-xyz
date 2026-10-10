import { createPublicClient, http } from "viem";
import { monadTestnet } from "viem/chains";

export const chain = monadTestnet;

/** Browsers read through the public RPC; servers use Alchemy (see lib/server/rpc.ts). */
export const publicClient = createPublicClient({
  chain,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL || "https://testnet-rpc.monad.xyz"),
  pollingInterval: 400, // Monad blocks land every ~400ms
});
