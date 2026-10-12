import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { encodeAbiParameters, decodeAbiParameters, keccak256, recoverMessageAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { attest, type ChainConfig } from "./chain";
import { envelope, open, openOwn, revealPublicKey, seal, unwrap, type SealedPicks } from "./sealed";

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

import { parseVerdict, prompt } from "./ai";

describe("AI verdicts", () => {
  test("takes the last verdict word, defaults to PENDING", () => {
    expect(parseVerdict("YES")).toBe("YES");
    expect(parseVerdict("Based on reports... no.\n\nNO")).toBe("NO");
    expect(parseVerdict(" void ")).toBe("VOID");
    expect(parseVerdict("I'm not sure")).toBe("PENDING");
  });

  test("prompt carries the question and match", () => {
    const p = prompt({ question: "Will Saka score?", closedAt: "2026-10-11T14:00:00Z", match: "Arsenal 2-1 Chelsea" });
    expect(p).toContain("Will Saka score?");
    expect(p).toContain("Arsenal 2-1 Chelsea");
  });
});

describe("two-box envelope (CRE + the fan's own copy)", () => {
  const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));
  const hex = (b: Uint8Array) => `0x${Buffer.from(b).toString("hex")}` as `0x${string}`;
  const creKey = hex(rand(32));
  const selfKey = hex(rand(32));
  const picks: SealedPicks = { v: 1, home: [2, 1, 0], away: [1, 1, 3], salt: `0x${"ab".repeat(32)}` };

  test("CRE opens its box and the fan opens theirs, each with only their own key", () => {
    const sealed = envelope(seal(revealPublicKey(creKey), picks, rand), seal(revealPublicKey(selfKey), picks, rand));
    expect(open<SealedPicks>(creKey, sealed)).toEqual(picks);
    expect(openOwn<SealedPicks>(selfKey, sealed)).toEqual(picks);
    expect(openOwn<SealedPicks>(creKey, sealed)).toBeNull();
    expect(open<SealedPicks>(selfKey, sealed)).toBeNull();
  });

  test("old single-box entries still open for CRE and have no self copy", () => {
    const old = seal(revealPublicKey(creKey), picks, rand);
    expect(unwrap(old)).toEqual({ cre: old, self: null });
    expect(open<SealedPicks>(creKey, old)).toEqual(picks);
    expect(openOwn<SealedPicks>(selfKey, old)).toBeNull();
  });

  test("malformed envelopes fail closed", () => {
    expect(open<SealedPicks>(creKey, "0x5453423100ff00")).toBeNull();
    expect(openOwn<SealedPicks>(selfKey, "0x")).toBeNull();
  });
});
