/**
 * Reading Terrace contracts and writing reports to TerraceOracle from a CRE workflow.
 *
 * Every report the oracle accepts is abi.encode(uint8 kind, bytes payload). While we settle
 * through `cre workflow simulate --broadcast` (MockKeystoneForwarder, which checks no
 * signatures), the body is also signed by the attestor key, and the oracle verifies it:
 *   digest = keccak256(abi.encode(chainId, oracle, simNonce, keccak256(body)))
 *   report = abi.encode(bytes body, bytes eip191Signature(digest))
 */
import {
  bytesToHex,
  cre,
  encodeCallMsg,
  getNetwork,
  LATEST_BLOCK_NUMBER,
  prepareReportRequest,
  type Runtime,
} from "@chainlink/cre-sdk";
import { secp256k1 } from "@noble/curves/secp256k1";
import {
  concatHex,
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  hexToBytes,
  keccak256,
  numberToHex,
  zeroAddress,
  type Abi,
  type Address,
  type ContractFunctionArgs,
  type ContractFunctionName,
  type ContractFunctionReturnType,
  type Hex,
} from "viem";
import { ORACLE_ABI } from "./abi";

export type ChainConfig = {
  chainSelectorName: string; // "monad-testnet"
  chainId: number; // 10143
  oracleAddress: string;
  gasLimit: string;
  /** true while settling through the MockKeystoneForwarder */
  simulation: boolean;
};

export function evmClient(cfg: ChainConfig) {
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: cfg.chainSelectorName, isTestnet: true });
  if (!network) throw new Error(`unknown network ${cfg.chainSelectorName}`);
  return new cre.capabilities.EVMClient(network.chainSelector.selector);
}

/** Read a view function at the latest block. */
export function read<
  const abi extends Abi,
  fn extends ContractFunctionName<abi, "view" | "pure">,
  const args extends ContractFunctionArgs<abi, "view" | "pure", fn>,
>(
  runtime: Runtime<unknown>,
  evm: InstanceType<typeof cre.capabilities.EVMClient>,
  to: string,
  abi: abi,
  functionName: fn,
  args?: args,
): ContractFunctionReturnType<abi, "view" | "pure", fn, args> {
  const data = encodeFunctionData({ abi, functionName, args } as never);
  const reply = evm
    .callContract(runtime, {
      call: encodeCallMsg({ from: zeroAddress, to: to as Address, data }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result();
  return decodeFunctionResult({ abi, functionName, args, data: bytesToHex(reply.data) } as never) as never;
}

/** Sign the report body with the attestor key, exactly as TerraceOracle verifies it. */
export function attest(body: Hex, cfg: ChainConfig, simNonce: bigint, attestorKey: Hex): Hex {
  const digest = keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "bytes32" }],
      [BigInt(cfg.chainId), cfg.oracleAddress as Address, simNonce, keccak256(body)],
    ),
  );
  const ethDigest = keccak256(concatHex(["0x19457468657265756d205369676e6564204d6573736167653a0a3332", digest]));
  const sig = secp256k1.sign(hexToBytes(ethDigest), hexToBytes(attestorKey));
  const signature = concatHex([
    numberToHex(sig.r, { size: 32 }),
    numberToHex(sig.s, { size: 32 }),
    numberToHex(sig.recovery + 27, { size: 1 }),
  ]);
  return encodeAbiParameters([{ type: "bytes" }, { type: "bytes" }], [body, signature]);
}

/**
 * Write one report to TerraceOracle.
 * @param attestorKey required when cfg.simulation is true (read it with runtime.getSecret in DON mode)
 */
export function writeReport(
  runtime: Runtime<unknown>,
  cfg: ChainConfig,
  kind: number,
  payload: Hex,
  attestorKey?: Hex,
): string {
  const evm = evmClient(cfg);
  let report = encodeAbiParameters([{ type: "uint8" }, { type: "bytes" }], [kind, payload]);
  if (cfg.simulation) {
    if (!attestorKey) throw new Error("simulation mode needs the attestor key");
    const nonce = read(runtime, evm, cfg.oracleAddress, ORACLE_ABI, "simNonce");
    report = attest(report, cfg, nonce, attestorKey);
  }

  const signed = runtime.report(prepareReportRequest(report)).result();
  const tx = evm
    .writeReport(runtime, {
      receiver: cfg.oracleAddress,
      report: signed,
      gasConfig: { gasLimit: cfg.gasLimit },
    })
    .result();
  return String(tx.txStatus);
}

/** Seconds since epoch from the DON's agreed clock (never Date.now in a workflow). */
export function nowSeconds(runtime: Runtime<unknown>): bigint {
  return BigInt(Math.floor(runtime.now().getTime() / 1000));
}
