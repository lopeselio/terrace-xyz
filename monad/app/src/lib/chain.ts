import { createPublicClient, http } from "viem";
import { monadTestnet } from "viem/chains";

export const chain = monadTestnet;

export const publicClient = createPublicClient({
  chain,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL || "https://testnet-rpc.monad.xyz"),
});

export const LEAGUES_ADDRESS = (process.env.NEXT_PUBLIC_LEAGUES_ADDRESS || "0x") as `0x${string}`;
