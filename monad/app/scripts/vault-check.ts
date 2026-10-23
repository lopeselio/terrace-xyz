/**
 * Checks the app's vault code against the real TerraceVault on a local anvil:
 *   anvil --port 8546 &
 *   (cd ../contracts && forge build) && bun scripts/vault-check.ts
 * Wrap/unwrap, the wrap key, the EIP-712 Link digest, and a full link → read → unwrap round trip.
 */
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, hashTypedData, http, parseAbi, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { linkMessage, unwrapRoot, vaultAbi, WRAP_MESSAGE, wrapKeyFromSignature, wrapRoot } from "../src/lib/vault";

const rpc = process.env.ANVIL_URL ?? "http://127.0.0.1:8546";
const artifact = JSON.parse(readFileSync(new URL("../../contracts/out/TerraceVault.sol/TerraceVault.json", import.meta.url), "utf8"));
const abi = [...vaultAbi, ...parseAbi(["function linkDigest(address account, bytes wrapped, uint256 nonce) view returns (bytes32)"])];

let failed = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) failed++;
};
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

// Anvil's first funded account plays the fan's Terrace account; the unlocker is a fresh key (the email wallet).
const fan = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const unlocker = privateKeyToAccount(generatePrivateKey());
const pub = createPublicClient({ chain: foundry, transport: http(rpc) });
const wallet = createWalletClient({ account: fan, chain: foundry, transport: http(rpc) });

// 1. Crypto on its own.
const root = crypto.getRandomValues(new Uint8Array(32));
const sig = await unlocker.signMessage({ message: WRAP_MESSAGE });
const wrapKey = wrapKeyFromSignature(sig);
check("the same message signs to the same wrap key", same(wrapKey, wrapKeyFromSignature(await unlocker.signMessage({ message: WRAP_MESSAGE }))));
const flippedV = (sig.slice(0, -2) + (parseInt(sig.slice(-2), 16) === 27 ? "00" : "01")) as Hex;
check("v as 0/1 or 27/28 gives the same wrap key", same(wrapKey, wrapKeyFromSignature(flippedV)));
const wrapped = wrapRoot(root, wrapKey, fan.address);
check("blob is 61 bytes (version, nonce, root, tag)", (wrapped.length - 2) / 2 === 61);
check("unwrap gives the root back", same(unwrapRoot(wrapped, wrapKey, fan.address), root));
let rejected = false;
try {
  unwrapRoot(wrapped, wrapKey, unlocker.address);
} catch {
  rejected = true;
}
check("a blob can't be opened as another account's", rejected);

// 2. Against the contract.
const deployHash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object as Hex });
const vault = (await pub.waitForTransactionReceipt({ hash: deployHash })).contractAddress as Address;
const typed = linkMessage(vault, foundry.id, fan.address, wrapped, 0n);
const onchainDigest = await pub.readContract({ address: vault, abi, functionName: "linkDigest", args: [fan.address, wrapped, 0n] });
check("app's EIP-712 Link hashes like the contract's", hashTypedData(typed) === onchainDigest);

const unlockerSig = await unlocker.signTypedData(typed);
const linkHash = await wallet.writeContract({ address: vault, abi, functionName: "link", args: [unlocker.address, wrapped, unlockerSig] });
check("link() succeeds", (await pub.waitForTransactionReceipt({ hash: linkHash })).status === "success");
const [account, stored] = await pub.readContract({ address: vault, abi, functionName: "entryOf", args: [unlocker.address] });
check("entryOf points at the fan's account", account === fan.address);
check("the stored blob opens to the same root", same(unwrapRoot(stored, wrapKeyFromSignature(await unlocker.signMessage({ message: WRAP_MESSAGE })), account), root));

console.log(failed ? `\n${failed} failed` : "\nall good");
process.exit(failed ? 1 : 0);
