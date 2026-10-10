import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { encodeAbiParameters, decodeAbiParameters, keccak256, recoverMessageAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { attest, type ChainConfig } from "./chain";
import { open, revealPublicKey, seal, type SealedPicks } from "./sealed";

const rand = (n: number) => new Uint8Array(randomBytes(n));

describe("sealed payloads", () => {
  const revealKey = `0x${"11".repeat(32)}` as Hex;
  const pub = revealPublicKey(revealKey);

  test("open(seal(x)) === x", () => {
    const picks: SealedPicks = { v: 1, home: [2, 0], away: [1, 3], salt: `0x${"ab".repeat(32)}` };
    const sealed = seal(pub, picks, rand);
    expect(open<SealedPicks>(revealKey, sealed)).toEqual(picks);
  });

  test("wrong key or tampering gives null", () => {
    const sealed = seal(pub, { v: 1, side: 1, salt: `0x${"cd".repeat(32)}` }, rand);
    expect(open(`0x${"22".repeat(32)}`, sealed)).toBeNull();
    const tampered = (sealed.slice(0, -2) + (sealed.endsWith("00") ? "01" : "00")) as Hex;
    expect(open(revealKey, tampered)).toBeNull();
  });
});

describe("attestation", () => {
  test("signature recovers to the attestor over the oracle digest", async () => {
    const key = `0x${"a7".repeat(32)}` as Hex;
    const cfg: ChainConfig = {
      chainSelectorName: "monad-testnet",
      chainId: 10143,
      oracleAddress: "0x00000000000000000000000000000000000000aa",
      gasLimit: "500000",
      simulation: true,
    };
    const body = encodeAbiParameters([{ type: "uint8" }, { type: "bytes" }], [2, "0xbeef"]);
    const wrapped = attest(body, cfg, 7n, key);
    const [gotBody, sig] = decodeAbiParameters([{ type: "bytes" }, { type: "bytes" }], wrapped);
    expect(gotBody).toBe(body);

    const digest = keccak256(
      encodeAbiParameters(
        [{ type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "bytes32" }],
        [10143n, cfg.oracleAddress as Hex, 7n, keccak256(body)],
      ),
    );
    const signer = await recoverMessageAddress({ message: { raw: digest }, signature: sig });
    expect(signer).toBe(privateKeyToAccount(key).address);
  });
});
