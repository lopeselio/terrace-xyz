/**
 * Self-contained RescueCipher port for React Native.
 *
 * Faithful translation of @arcium-hq/client/src/cryptography/rescueCipher{,Common}.ts
 * plus its dependency graph (rescueDesc, rescuePrimeHash, matrix, ctUtils,
 * serializeLE/deserializeLE). No Node stdlib imports — only @noble.
 *
 * Public API:
 *   const cipher = new RescueCipher(sharedSecret);            // 32-byte X25519 shared
 *   const ct: number[][] = cipher.encrypt([0n], nonce16);     // each block = 32 bytes
 *   const pt: bigint[]   = cipher.decrypt(ct, nonce16);
 *
 * Correctness: verified byte-for-byte against the @arcium-hq/client reference
 * via packages/programs/scripts/verify-rescue-cipher.ts.
 */

import { Field, invert, type IField } from "@noble/curves/abstract/modular.js";
import { shake256 } from "@noble/hashes/sha3.js";

// ─────────────────────────────────────────────────────────────────────────────
// Field — Curve25519 base field: p = 2^255 - 19
// ─────────────────────────────────────────────────────────────────────────────

export type FpField = IField<bigint>;

const P_25519 = (1n << 255n) - 19n;
export const CURVE25519_BASE_FIELD: FpField = Field(P_25519);

// ─────────────────────────────────────────────────────────────────────────────
// Serialization
// ─────────────────────────────────────────────────────────────────────────────

export function serializeLE(val: bigint, lengthInBytes: number): Uint8Array {
  const result = new Uint8Array(lengthInBytes);
  let temp = val;
  for (let i = 0; i < lengthInBytes; i++) {
    result[i] = Number(temp & 0xffn);
    temp >>= 8n;
  }
  if (temp > 0n) {
    throw new Error(`Value ${val} too large for ${lengthInBytes} bytes`);
  }
  return result;
}

export function deserializeLE(bytes: Uint8Array): bigint {
  let result = 0n;
  for (let i = 0; i < bytes.length; i++) {
    result |= BigInt(bytes[i]) << (BigInt(i) * 8n);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constant-time helpers (verbatim port of ctUtils.ts)
// ─────────────────────────────────────────────────────────────────────────────

function ctSignBit(x: bigint, binSize: bigint): boolean {
  return ((x >> binSize) & 1n) === 1n;
}

function toBinLE(x: bigint, binSize: bigint): boolean[] {
  const res: boolean[] = [];
  for (let i = 0; i < binSize; i++) res.push(ctSignBit(x, BigInt(i)));
  return res;
}

function fromBinLE(xBin: boolean[]): bigint {
  let res = 0n;
  for (let i = 0; i < xBin.length - 1; i++) {
    res |= BigInt(xBin[i]) << BigInt(i);
  }
  return res - (BigInt(xBin[xBin.length - 1]) << BigInt(xBin.length - 1));
}

function adder(xBin: boolean[], yBin: boolean[], carryIn: boolean, binSize: bigint): boolean[] {
  const res: boolean[] = [];
  let carry = carryIn;
  for (let i = 0; i < binSize; i++) {
    const yXorCarry = yBin[i] !== carry;
    res.push(xBin[i] !== yXorCarry);
    carry = yBin[i] !== (yXorCarry && (xBin[i] !== yBin[i]));
  }
  return res;
}

function ctAdd(x: bigint, y: bigint, binSize: bigint): bigint {
  return fromBinLE(adder(toBinLE(x, binSize), toBinLE(y, binSize), false, binSize));
}

function ctSub(x: bigint, y: bigint, binSize: bigint): bigint {
  const yBin = toBinLE(y, binSize);
  const yBinNot: boolean[] = [];
  for (let i = 0; i < binSize; i++) yBinNot.push(yBin[i] === false);
  return fromBinLE(adder(toBinLE(x, binSize), yBinNot, true, binSize));
}

function ctLt(x: bigint, y: bigint, binSize: bigint): boolean {
  return ctSignBit(ctSub(x, y, binSize), binSize);
}

function ctSelect(b: boolean, x: bigint, y: bigint, binSize: bigint): bigint {
  return ctAdd(y, BigInt(b) * ctSub(x, y, binSize), binSize);
}

function verifyBinSize(x: bigint, binSize: bigint): boolean {
  const bin = (x >> binSize).toString(2);
  return bin === "0" || bin === "-1";
}

function getBinSize(max: bigint): bigint {
  return BigInt(Math.floor(Math.log2(Number(max)))) + 3n;
}

// ─────────────────────────────────────────────────────────────────────────────
// Matrix — verbatim port (drops randMatrix which needs Node RNG)
// ─────────────────────────────────────────────────────────────────────────────

class Matrix {
  field: FpField;
  data: readonly bigint[][];

  constructor(field: FpField, data: readonly bigint[][]) {
    this.field = field;
    const ncols = data[0].length;
    for (let i = 1; i < data.length; i++) {
      if (data[i].length !== ncols) throw new Error("All rows must have same number of columns.");
    }
    this.data = data.map((row) => row.map((c) => field.create(c)));
  }

  matMul(rhs: Matrix): Matrix {
    const thisN = this.data.length, thisM = this.data[0].length;
    const rhsN = rhs.data.length, rhsM = rhs.data[0].length;
    if (thisM !== rhsN) throw new Error(`this.ncols !== rhs.nrows (${thisM} !== ${rhsN})`);
    const data: bigint[][] = [];
    for (let i = 0; i < thisN; i++) {
      const row: bigint[] = [];
      for (let j = 0; j < rhsM; j++) {
        let c = this.field.ZERO;
        for (let k = 0; k < thisM; k++) {
          c = this.field.add(c, this.field.mul(this.data[i][k], rhs.data[k][j]));
        }
        row.push(c);
      }
      data.push(row);
    }
    return new Matrix(this.field, data);
  }

  add(rhs: Matrix, ct: boolean = false): Matrix {
    const n = this.data.length, m = this.data[0].length;
    if (rhs.data.length !== n || rhs.data[0].length !== m) throw new Error("shape mismatch");
    const binSize = getBinSize(this.field.ORDER - 1n);
    const data: bigint[][] = [];
    for (let i = 0; i < n; i++) {
      const row: bigint[] = [];
      for (let j = 0; j < m; j++) {
        if (ct) {
          const sum = ctAdd(this.data[i][j], rhs.data[i][j], binSize);
          row.push(ctSelect(ctLt(sum, this.field.ORDER, binSize), sum, ctSub(sum, this.field.ORDER, binSize), binSize));
        } else {
          row.push(this.field.add(this.data[i][j], rhs.data[i][j]));
        }
      }
      data.push(row);
    }
    return new Matrix(this.field, data);
  }

  sub(rhs: Matrix, ct: boolean = false): Matrix {
    const n = this.data.length, m = this.data[0].length;
    if (rhs.data.length !== n || rhs.data[0].length !== m) throw new Error("shape mismatch");
    const binSize = getBinSize(this.field.ORDER - 1n);
    const data: bigint[][] = [];
    for (let i = 0; i < n; i++) {
      const row: bigint[] = [];
      for (let j = 0; j < m; j++) {
        if (ct) {
          const diff = ctSub(this.data[i][j], rhs.data[i][j], binSize);
          row.push(ctSelect(ctSignBit(diff, binSize), ctAdd(diff, this.field.ORDER, binSize), diff, binSize));
        } else {
          row.push(this.field.sub(this.data[i][j], rhs.data[i][j]));
        }
      }
      data.push(row);
    }
    return new Matrix(this.field, data);
  }

  pow(e: bigint): Matrix {
    const data: bigint[][] = [];
    for (let i = 0; i < this.data.length; i++) {
      const row: bigint[] = [];
      for (let j = 0; j < this.data[0].length; j++) row.push(this.field.pow(this.data[i][j], e));
      data.push(row);
    }
    return new Matrix(this.field, data);
  }

  det(): bigint {
    const n = this.data.length;
    if (n === 0 || !this.is_square()) throw new Error("Matrix must be square and non-empty");
    let det = this.field.ONE;
    let rows: bigint[][] = this.data.map((row) => [...row]);
    for (let i = 0; i < n; i++) {
      const lz = rows.filter((r) => this.field.is0(r[0]));
      const nlz = rows.filter((r) => !this.field.is0(r[0]));
      const pivotRow = nlz.shift();
      if (pivotRow === undefined) return this.field.ZERO;
      const pivot = pivotRow[0];
      det = this.field.mul(det, pivot);
      const pivotInv = this.field.inv(pivot);
      const normalized = pivotRow.map((v) => this.field.mul(pivotInv, v));
      const nlzProcessed = nlz.map((row) => {
        const lead = row[0];
        return row.map((v, k) => this.field.sub(v, this.field.mul(lead, normalized[k])));
      });
      rows = nlzProcessed.concat(lz).map((row) => row.slice(1));
    }
    return det;
  }

  is_square(): boolean {
    const n = this.data.length;
    for (let i = 1; i < n; i++) if (this.data[i].length !== n) return false;
    return true;
  }
}

function toVec(data: bigint[]): bigint[][] {
  return data.map((d) => [d]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Rescue permutation core
// ─────────────────────────────────────────────────────────────────────────────

type RescueMode = { kind: "cipher"; key: bigint[] } | { kind: "hash"; m: number; capacity: number };

const SECURITY_LEVEL_BLOCK_CIPHER = 128;
const SECURITY_LEVEL_HASH_FUNCTION = 256;

function getAlphaAndInverse(p: bigint): [bigint, bigint] {
  const pMinusOne = p - 1n;
  let alpha = 0n;
  for (const a of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n, 43n, 47n]) {
    if (pMinusOne % a !== 0n) { alpha = a; break; }
  }
  if (alpha === 0n) throw new Error("Could not find prime alpha not dividing p-1");
  return [alpha, invert(alpha, pMinusOne)];
}

function getNRounds(p: bigint, mode: RescueMode, alpha: bigint, m: number): number {
  function dcon(n: number): number { return Math.floor(0.5 * (Number(alpha) - 1) * m * (n - 1) + 2.0); }
  function v(n: number, rate: number): number { return m * (n - 1) + rate; }
  function binomial(n: number, k: number): bigint {
    function fact(x: bigint): bigint { return x <= 1n ? 1n : x * fact(x - 1n); }
    return fact(BigInt(n)) / (fact(BigInt(n - k)) * fact(BigInt(k)));
  }

  if (mode.kind === "cipher") {
    const l0 = Math.ceil((2 * SECURITY_LEVEL_BLOCK_CIPHER) / ((m + 1) * (Math.log2(Number(p)) - Math.log2(Number(alpha) - 1))));
    const l1 = alpha === 3n
      ? Math.ceil((SECURITY_LEVEL_BLOCK_CIPHER + 2) / (4 * m))
      : Math.ceil((SECURITY_LEVEL_BLOCK_CIPHER + 3) / (5.5 * m));
    return 2 * Math.max(l0, l1, 5);
  } else {
    const rate = m - mode.capacity;
    const target = 1n << BigInt(SECURITY_LEVEL_HASH_FUNCTION);
    let l1 = 1;
    let tmp = binomial(v(l1, rate) + dcon(l1), v(l1, rate));
    while (tmp * tmp <= target && l1 <= 23) {
      l1 += 1;
      tmp = binomial(v(l1, rate) + dcon(l1), v(l1, rate));
    }
    return Math.ceil(1.5 * Math.max(5, l1));
  }
}

function buildCauchy(field: FpField, size: number): Matrix {
  const data: bigint[][] = [];
  for (let i = 1n; i <= size; i++) {
    const row: bigint[] = [];
    for (let j = 1n; j <= size; j++) row.push(field.inv(i + j));
    data.push(row);
  }
  return new Matrix(field, data);
}

function buildInverseCauchy(field: FpField, size: number): Matrix {
  function product(arr: bigint[]): bigint {
    return arr.reduce((acc, curr) => field.mul(acc, field.create(curr)), field.ONE);
  }
  function prime(arr: bigint[], val: bigint): bigint {
    return product(arr.map((u) => (u !== val ? val - u : 1n)));
  }
  const data: bigint[][] = [];
  for (let i = 1n; i <= size; i++) {
    const row: bigint[] = [];
    for (let j = 1n; j <= size; j++) {
      const a = product(Array.from({ length: size }, (_, k) => -i - BigInt(1 + k)));
      const aPrime = prime(Array.from({ length: size }, (_, k) => BigInt(1 + k)), j);
      const b = product(Array.from({ length: size }, (_, k) => j + BigInt(1 + k)));
      const bPrime = prime(Array.from({ length: size }, (_, k) => -BigInt(1 + k)), -i);
      row.push(field.mul(a, field.mul(b, field.mul(field.inv(aPrime), field.mul(field.inv(bPrime), field.inv(-i - j))))));
    }
    data.push(row);
  }
  return new Matrix(field, data);
}

function exponentForEven(mode: RescueMode, alpha: bigint, alphaInverse: bigint): bigint {
  return mode.kind === "cipher" ? alphaInverse : alpha;
}
function exponentForOdd(mode: RescueMode, alpha: bigint, alphaInverse: bigint): bigint {
  return mode.kind === "cipher" ? alpha : alphaInverse;
}

function rescuePermutation(
  mode: RescueMode,
  alpha: bigint,
  alphaInverse: bigint,
  mdsMat: Matrix,
  subkeys: Matrix[],
  state: Matrix,
): Matrix[] {
  const expEven = exponentForEven(mode, alpha, alphaInverse);
  const expOdd  = exponentForOdd(mode, alpha, alphaInverse);
  const states: Matrix[] = [state.add(subkeys[0])];
  for (let r = 0; r < subkeys.length - 1; r++) {
    let s = states[r];
    s = r % 2 === 0 ? s.pow(expEven) : s.pow(expOdd);
    states.push(mdsMat.matMul(s).add(subkeys[r + 1]));
  }
  return states;
}

// ─────────────────────────────────────────────────────────────────────────────
// RescueDesc — round constants + key schedule
// ─────────────────────────────────────────────────────────────────────────────

class RescueDesc {
  mode: RescueMode;
  field: FpField;
  alpha: bigint;
  alphaInverse: bigint;
  nRounds: number;
  m: number;
  mdsMat: Matrix;
  mdsMatInverse: Matrix;
  roundKeys: Matrix[];

  constructor(field: FpField, mode: RescueMode) {
    this.field = field;
    this.mode = mode;
    this.m = mode.kind === "cipher" ? mode.key.length : mode.m;
    if (mode.kind === "cipher" && this.m < 2) throw new Error(`m must be >= 2 (found ${this.m})`);

    [this.alpha, this.alphaInverse] = getAlphaAndInverse(field.ORDER);
    this.nRounds = getNRounds(field.ORDER, mode, this.alpha, this.m);
    this.mdsMat = buildCauchy(field, this.m);
    this.mdsMatInverse = buildInverseCauchy(field, this.m);

    const roundConstants = this.sampleConstants(this.nRounds);

    if (mode.kind === "cipher") {
      this.roundKeys = rescuePermutation(
        mode, this.alpha, this.alphaInverse, this.mdsMat, roundConstants,
        new Matrix(field, toVec(mode.key)),
      );
    } else {
      this.roundKeys = roundConstants;
    }
  }

  sampleConstants(nRounds: number): Matrix[] {
    const field = this.field;
    const m = this.m;
    const hasher = shake256.create({ dkLen: 256 / 8 });
    const bufferLen = Math.ceil(field.BITS / 8) + 16;
    const enc = new TextEncoder();

    if (this.mode.kind === "cipher") {
      hasher.update(enc.encode("encrypt everything, compute anything"));
      const rArr = Array.from({ length: m * m + 2 * m }, () =>
        field.create(deserializeLE(hasher.xof(bufferLen))),
      );
      const matData = Array.from({ length: m }, () => rArr.splice(0, m));
      let roundConstantMat = new Matrix(field, matData);
      const initData = Array.from({ length: m }, () => rArr.splice(0, 1));
      const initial = new Matrix(field, initData);
      const roundData = Array.from({ length: m }, () => rArr.splice(0, 1));
      const affineTerm = new Matrix(field, roundData);

      while (field.is0(roundConstantMat.det())) {
        const resample = Array.from({ length: m * m }, () =>
          field.create(deserializeLE(hasher.xof(bufferLen))),
        );
        const resampleData = Array.from({ length: m }, () => resample.splice(0, m));
        roundConstantMat = new Matrix(field, resampleData);
      }

      const rcs: Matrix[] = [initial];
      for (let r = 0; r < 2 * this.nRounds; r++) {
        rcs.push(roundConstantMat.matMul(rcs[r]).add(affineTerm));
      }
      return rcs;
    } else {
      hasher.update(enc.encode(`Rescue-XLIX(${field.ORDER},${m},${(this.mode as { capacity: number }).capacity},${SECURITY_LEVEL_HASH_FUNCTION})`));
      const zeros: bigint[][] = [];
      for (let i = 0; i < m; i++) zeros.push([0n]);
      const rcs: Matrix[] = [new Matrix(field, zeros)];
      const rArr = Array.from({ length: 2 * m * nRounds }, () =>
        field.create(deserializeLE(hasher.xof(bufferLen))),
      );
      for (let r = 0; r < 2 * nRounds; r++) {
        const data: bigint[][] = [];
        for (let i = 0; i < m; i++) data.push([rArr[r * m + i]]);
        rcs.push(new Matrix(field, data));
      }
      return rcs;
    }
  }

  permute(state: Matrix): Matrix {
    return rescuePermutation(
      this.mode, this.alpha, this.alphaInverse, this.mdsMat, this.roundKeys, state,
    )[2 * this.nRounds];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RescuePrimeHash — sponge with rate=7, capacity=5, m=12
// ─────────────────────────────────────────────────────────────────────────────

class RescuePrimeHash {
  desc: RescueDesc;
  rate: number;
  digestLength: number;

  constructor(field: FpField) {
    this.desc = new RescueDesc(field, { kind: "hash", m: 12, capacity: 5 });
    this.rate = 7;
    this.digestLength = 5;
  }

  digest(message: bigint[]): bigint[] {
    const padded = [...message, 1n];
    while (padded.length % this.rate !== 0) padded.push(0n);

    const zeros: bigint[][] = [];
    for (let i = 0; i < this.desc.m; i++) zeros.push([0n]);
    let state = new Matrix(this.desc.field, zeros);

    for (let r = 0; r < padded.length / this.rate; r++) {
      const data: bigint[][] = [];
      for (let i = 0; i < this.rate; i++) data[i] = [padded[r * this.rate + i]];
      for (let i = this.rate; i < this.desc.m; i++) data[i] = [0n];
      const s = new Matrix(this.desc.field, data);
      state = this.desc.permute(state.add(s, true));
    }

    const res: bigint[] = [];
    for (let i = 0; i < this.digestLength; i++) res.push(state.data[i][0]);
    return res;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RescueCipherCommon — CTR mode with block size 5
// ─────────────────────────────────────────────────────────────────────────────

const RESCUE_CIPHER_BLOCK_SIZE = 5;

function getCounter(nonce: bigint, nBlocks: number): bigint[] {
  const counter: bigint[] = [];
  for (let i = 0n; i < nBlocks; i++) {
    counter.push(nonce);
    counter.push(i);
    for (let j = 2; j < RESCUE_CIPHER_BLOCK_SIZE; j++) counter.push(0n);
  }
  return counter;
}

class RescueCipherCommon {
  desc: RescueDesc;

  constructor(sharedSecret: Uint8Array, field: FpField) {
    if (sharedSecret.length !== 32) {
      throw new Error(`sharedSecret must be 32 bytes (got ${sharedSecret.length})`);
    }
    const hasher = new RescuePrimeHash(field);
    const converted: bigint[] = [];
    if (field === CURVE25519_BASE_FIELD) {
      converted.push(deserializeLE(sharedSecret));
    } else {
      const chunkSize = field.BYTES - 1;
      const nChunks = Math.ceil(sharedSecret.length / chunkSize);
      for (let i = 0; i < nChunks; i++) {
        converted.push(deserializeLE(sharedSecret.slice(i * chunkSize, (i + 1) * chunkSize)));
      }
    }
    const counter = [1n, ...converted, BigInt(RESCUE_CIPHER_BLOCK_SIZE)];
    const rescueKey = hasher.digest(counter);
    this.desc = new RescueDesc(field, { kind: "cipher", key: rescueKey });
  }

  encrypt_raw(plaintext: bigint[], nonce: Uint8Array): bigint[] {
    if (nonce.length !== 16) throw new Error(`nonce must be 16 bytes (got ${nonce.length})`);
    const binSize = getBinSize(this.desc.field.ORDER - 1n);
    const order = this.desc.field.ORDER;

    const encryptBatch = (desc: RescueDesc, ptxt: bigint[], cntr: bigint[]): bigint[] => {
      if (cntr.length !== RESCUE_CIPHER_BLOCK_SIZE) throw new Error("bad counter len");
      const encryptedCounter = desc.permute(new Matrix(desc.field, toVec(cntr)));
      const ct: bigint[] = [];
      for (let i = 0; i < ptxt.length; i++) {
        if (!verifyBinSize(ptxt[i], binSize - 1n) || ctSignBit(ptxt[i], binSize) || !ctLt(ptxt[i], order, binSize)) {
          throw new Error(`plaintext must be in [0, ${order})`);
        }
        const sum = ctAdd(ptxt[i], encryptedCounter.data[i][0], binSize);
        ct.push(ctSelect(ctLt(sum, order, binSize), sum, ctSub(sum, order, binSize), binSize));
      }
      return ct;
    };

    const nBlocks = Math.ceil(plaintext.length / RESCUE_CIPHER_BLOCK_SIZE);
    const counter = getCounter(deserializeLE(nonce), nBlocks);
    const out: bigint[] = [];
    for (let i = 0; i < nBlocks; i++) {
      const cnt = RESCUE_CIPHER_BLOCK_SIZE * i;
      const ct = encryptBatch(
        this.desc,
        plaintext.slice(cnt, Math.min(cnt + RESCUE_CIPHER_BLOCK_SIZE, plaintext.length)),
        counter.slice(cnt, cnt + RESCUE_CIPHER_BLOCK_SIZE),
      );
      for (const c of ct) out.push(c);
    }
    return out;
  }

  encrypt(plaintext: bigint[], nonce: Uint8Array): number[][] {
    return this.encrypt_raw(plaintext, nonce).map((c) => Array.from(serializeLE(c, 32)));
  }

  decrypt_raw(ciphertext: bigint[], nonce: Uint8Array): bigint[] {
    if (nonce.length !== 16) throw new Error(`nonce must be 16 bytes (got ${nonce.length})`);
    const binSize = getBinSize(this.desc.field.ORDER - 1n);

    const decryptBatch = (desc: RescueDesc, ctxt: bigint[], cntr: bigint[]): bigint[] => {
      if (cntr.length !== RESCUE_CIPHER_BLOCK_SIZE) throw new Error("bad counter len");
      const encryptedCounter = desc.permute(new Matrix(desc.field, toVec(cntr)));
      const pt: bigint[] = [];
      for (let i = 0; i < ctxt.length; i++) {
        const diff = ctSub(ctxt[i], encryptedCounter.data[i][0], binSize);
        pt.push(ctSelect(ctSignBit(diff, binSize), ctAdd(diff, desc.field.ORDER, binSize), diff, binSize));
      }
      return pt;
    };

    const nBlocks = Math.ceil(ciphertext.length / RESCUE_CIPHER_BLOCK_SIZE);
    const counter = getCounter(deserializeLE(nonce), nBlocks);
    const out: bigint[] = [];
    for (let i = 0; i < nBlocks; i++) {
      const cnt = RESCUE_CIPHER_BLOCK_SIZE * i;
      const pt = decryptBatch(
        this.desc,
        ciphertext.slice(cnt, Math.min(cnt + RESCUE_CIPHER_BLOCK_SIZE, ciphertext.length)),
        counter.slice(cnt, cnt + RESCUE_CIPHER_BLOCK_SIZE),
      );
      for (const p of pt) out.push(p);
    }
    return out;
  }

  decrypt(ciphertext: number[][], nonce: Uint8Array): bigint[] {
    return this.decrypt_raw(
      ciphertext.map((c) => {
        if (c.length !== 32) throw new Error(`ciphertext block must be 32 bytes (got ${c.length})`);
        return deserializeLE(Uint8Array.from(c));
      }),
      nonce,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export class RescueCipher {
  cipher: RescueCipherCommon;

  constructor(sharedSecret: Uint8Array) {
    this.cipher = new RescueCipherCommon(sharedSecret, CURVE25519_BASE_FIELD);
  }

  encrypt(plaintext: bigint[], nonce: Uint8Array): number[][] {
    return this.cipher.encrypt(plaintext, nonce);
  }

  decrypt(ciphertext: number[][], nonce: Uint8Array): bigint[] {
    return this.cipher.decrypt(ciphertext, nonce);
  }
}
