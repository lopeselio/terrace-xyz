/**
 * Verify that the app's pure-JS RescueCipher port byte-matches @arcium-hq/client.
 *
 * Run from packages/programs:
 *   pnpm exec ts-node scripts/verify-rescue-cipher.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { RescueCipher as ReferenceCipher } from "@arcium-hq/client";
import { RescueCipher as PortCipher } from "../../app/src/lib/rescueCipher";
import * as crypto from "crypto";

function eqBlocks(a: number[][], b: number[][]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].length !== b[i].length) return false;
    for (let j = 0; j < a[i].length; j++) if (a[i][j] !== b[i][j]) return false;
  }
  return true;
}

function hex(arr: number[]): string {
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

const cases: { name: string; sharedSecret: Uint8Array; plaintext: bigint[]; nonce: Uint8Array }[] = [
  {
    name: "outcome=0, deterministic shared/nonce",
    sharedSecret: new Uint8Array(32).fill(0x42),
    plaintext: [0n],
    nonce: new Uint8Array(16).fill(0x11),
  },
  {
    name: "outcome=1, deterministic shared/nonce",
    sharedSecret: new Uint8Array(32).fill(0x42),
    plaintext: [1n],
    nonce: new Uint8Array(16).fill(0x11),
  },
  {
    name: "outcome=1, random shared/nonce",
    sharedSecret: new Uint8Array(crypto.randomBytes(32)),
    plaintext: [1n],
    nonce: new Uint8Array(crypto.randomBytes(16)),
  },
  {
    name: "multi-block plaintext [0,1,2,3,4,5,6,7,8,9]",
    sharedSecret: new Uint8Array(crypto.randomBytes(32)),
    plaintext: Array.from({ length: 10 }, (_, i) => BigInt(i)),
    nonce: new Uint8Array(crypto.randomBytes(16)),
  },
];

let pass = 0, fail = 0;
for (const tc of cases) {
  const ref = new ReferenceCipher(tc.sharedSecret);
  const port = new PortCipher(tc.sharedSecret);

  const refCt  = ref.encrypt(tc.plaintext, tc.nonce);
  const portCt = port.encrypt(tc.plaintext, tc.nonce);

  const ok = eqBlocks(refCt, portCt);
  if (ok) {
    pass++;
    console.log(`✅ ${tc.name}`);
    console.log(`   ct[0] = ${hex(portCt[0]).slice(0, 32)}…`);
  } else {
    fail++;
    console.log(`❌ ${tc.name}`);
    console.log(`   ref  ct[0] = ${hex(refCt[0]).slice(0, 32)}…`);
    console.log(`   port ct[0] = ${hex(portCt[0]).slice(0, 32)}…`);
  }

  // Round-trip decrypt with port and check we recover plaintext
  const recovered = port.decrypt(refCt, tc.nonce);
  const rtOk = recovered.length === tc.plaintext.length && recovered.every((v, i) => v === tc.plaintext[i]);
  if (rtOk) {
    console.log(`   ↩  port decrypt(ref ciphertext) recovers plaintext ✓`);
  } else {
    console.log(`   ↩  port decrypt FAILED: ${recovered}`);
    fail++;
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
