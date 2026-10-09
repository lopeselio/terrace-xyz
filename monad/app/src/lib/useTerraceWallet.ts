"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { encodeFunctionData, parseEventLogs, type Address } from "viem";
import { leaguesAbi } from "./abi";
import { LEAGUES_ADDRESS, publicClient } from "./chain";

/**
 * The only place the app touches wallets. Screens call submitPicks / createChallenge
 * and never see addresses, gas or signatures. Gas is sponsored by the smart wallet's paymaster.
 */
export function useTerraceWallet() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { client } = useSmartWallets();
  const address = client?.account?.address as Address | undefined;

  async function send(data: `0x${string}`) {
    if (!client) throw new Error("wallet not ready");
    const hash = await client.sendTransaction({ to: LEAGUES_ADDRESS, data });
    return publicClient.waitForTransactionReceipt({ hash });
  }

  async function submitPicks(contestId: bigint, home: number[], away: number[]) {
    return send(encodeFunctionData({ abi: leaguesAbi, functionName: "submitPredictions", args: [contestId, home, away] }));
  }

  async function createChallenge(fixtureIds: bigint[]): Promise<bigint> {
    const receipt = await send(
      encodeFunctionData({
        abi: leaguesAbi,
        functionName: "createContest",
        args: [fixtureIds, "0x0000000000000000000000000000000000000000", 0n],
      }),
    );
    const [created] = parseEventLogs({ abi: leaguesAbi, eventName: "ContestCreated", logs: receipt.logs });
    if (!created) throw new Error("challenge not created");
    return created.args.contestId;
  }

  async function settle(contestId: bigint) {
    return send(encodeFunctionData({ abi: leaguesAbi, functionName: "finalizeContest", args: [contestId] }));
  }

  return {
    ready,
    authenticated,
    walletReady: authenticated && !!client,
    address,
    displayName: user?.email?.address ?? user?.phone?.number ?? undefined,
    login,
    logout,
    submitPicks,
    createChallenge,
    settle,
  };
}
