# Terrace v2 Private League on Devnet — Runbook

End-to-end procedure for standing up the Arcium MPC pipeline against Helius devnet, starting from the current `main` branch.

## 0. Pre-flight

```bash
# Tool versions you should have
solana --version          # 2.x
anchor --version          # 0.32.1
arcium --version          # 0.9.x  (must match arcium-anchor in Cargo.toml)
node --version            # 20+ or 22+

# Set Solana CLI to devnet
solana config set --url https://api.devnet.solana.com
solana config get
```

Get a Helius devnet API key from https://dev.helius.xyz/ — used for `ANCHOR_PROVIDER_URL` to bypass `api.devnet.solana.com` rate limits during the circuit upload (1500+ chunk transactions).

## 1. Wallet + funding

The deploy + upload pipeline is **expensive**. Budget at least 10 SOL on devnet.

```bash
# Use a dedicated devnet keypair (don't mix with localnet test wallet)
solana-keygen new -o ~/.config/solana/terrace-devnet.json
solana config set --keypair ~/.config/solana/terrace-devnet.json
solana airdrop 5    # repeat a few times; devnet caps per request
solana balance
```

Export it for the scripts:

```bash
export ANCHOR_WALLET=~/.config/solana/terrace-devnet.json
export ANCHOR_PROVIDER_URL="https://devnet.helius-rpc.com/?api-key=<YOUR_HELIUS_KEY>"
```

## 2. Build the program (with the BPF boxing fix)

```bash
cd packages/programs
anchor build
ls -lh target/deploy/terrace.so   # confirm timestamp is fresh
```

The build will emit warnings about `arcium_client::idl::arcium::utils::Account::try_from` having an 865KB frame — that's an arcium-client codegen quirk that doesn't get called on the InitMemberScore path. Our `try_accounts` functions should all be under 4096 now.

## 3. Deploy terrace to devnet

The program ID is pinned to `8dDXHX1x6didMogjFcMCNL6ZoY4XkP2RkSCKcCiaQssF` (in `Anchor.toml` `[programs.devnet]` and `declare_id!` inside `lib.rs`).

**First time only** — you need the program keypair for that ID. It should already be in `target/deploy/terrace-keypair.json` from a previous build. If not, you'll need to either generate one and update `declare_id!` in three places, or recover it from a teammate.

```bash
solana program deploy \
  --program-id target/deploy/terrace-keypair.json \
  --keypair $ANCHOR_WALLET \
  --url $ANCHOR_PROVIDER_URL \
  target/deploy/terrace.so
```

For subsequent deploys (upgrades), the same command works — Solana detects an existing upgradeable program at that ID and runs the upgrade flow.

Verify:

```bash
solana program show 8dDXHX1x6didMogjFcMCNL6ZoY4XkP2RkSCKcCiaQssF --url $ANCHOR_PROVIDER_URL
```

## 4. Initialize MXE on devnet

```bash
arcium init-mxe \
  --rpc-url $ANCHOR_PROVIDER_URL \
  --keypair $ANCHOR_WALLET \
  --program-id 8dDXHX1x6didMogjFcMCNL6ZoY4XkP2RkSCKcCiaQssF
```

This:

- Creates the MXE account at `derive_mxe_pda!(terrace_program_id)`.
- Assigns the MXE to a public Arcium devnet cluster (returns the cluster offset).
- Returns the LUT slot.

Save the cluster offset it prints (e.g. `1`). Add it to `Arcium.toml`:

```toml
[clusters.devnet]
offset = 1   # whatever arcium init-mxe returned
```

Commit that one-line change.

## 5. Initialize ArciumSignerAccount PDA

```bash
./node_modules/.bin/ts-node scripts/init-arcium-signer-pda.ts
```

This creates the program-owned `derive_sign_pda!()` PDA that arcium uses to sign callback CPIs. One-shot — fails harmlessly if already initialized.

## 6. Set up all comp_defs on devnet

This is the slow part — ~3MB of circuit bytes written across ~1500 transactions. Plan for 10–15 minutes total.

```bash
# 4 league circuits: init / increment / reveal member score + record_private_league_win_v2
./node_modules/.bin/ts-mocha -p ./tsconfig.scripts.json -t 1800000 \
  scripts/setup-arcium-league-v2.ts

# 3 private-market circuits: init / place_bet / reveal_market
./node_modules/.bin/ts-mocha -p ./tsconfig.scripts.json -t 1800000 \
  scripts/setup-arcium-private-market.ts
```

Each script idempotently runs 4 steps per circuit:

1. `init_computation_definition` (via terrace) — creates the comp_def_account
2. `init_raw_circuit_acc` — creates the raw_circuit account
3. `upload_circuit` (chunked) — writes the circuit bytes
4. `finalize_computation_definition` — flips the comp_def to executable

Re-running is safe; existing steps emit `⚡ already done, skipping`.

**If upload chunks start failing with "blockhash not found"** — that's RPC rate-limiting. Switch to a paid Helius tier or add throttling: edit `uploadCircuit()` in `setup-arcium-league-v2.ts` to `await sleep(200)` between chunks.

## 7. Smoke test: queue one MPC computation

Run the focused e2e test against devnet — same code that ships in `scripts/test-private-league-v2-e2e.ts`, but with the devnet provider envs:

```bash
ANCHOR_PROVIDER_URL=$ANCHOR_PROVIDER_URL \
ANCHOR_WALLET=$ANCHOR_WALLET \
./node_modules/.bin/ts-mocha -p ./tsconfig.json -t 1800000 \
  scripts/test-private-league-v2-e2e.ts
```

What should happen:

1. **Steps 1–10**: all 10 transactions confirm (create_league, join_league, init_member_score, create_market, init_private_market_state, place_private_bet, reveal_private_market, record_private_league_win_v2, advance_gameweek, reveal_member_score).
2. **Each callback lands in seconds** (not 5+ min like localnet). The `place_private_bet_v2` callback that hangs on the 2-node localnet should run in 5–30 s on the real Cerberus cluster.
3. **Final assertion**: `total_score == 1` — this is the one we couldn't verify on localnet because the bet callback never landed. If it fails, the next question is whether the bet circuit's MPC decryption returns `1` (i.e., the test's `encryptBet` X25519 + XOR-SHA256 scheme matches what arcis 0.9.7 expects).

## 8. Watch the MPC roundtrip in real time

```bash
# Devnet has block explorer support
echo "https://explorer.solana.com/address/<member_score_pda>?cluster=devnet"

# Or via RPC, poll the score account ciphertext (bytes 72..104):
solana account <member_score_pda> --url $ANCHOR_PROVIDER_URL --output json | \
  jq -r '.account.data[0]' | base64 -d | xxd -s 72 -l 32
```

A ciphertext change == a callback landed.

## 9. Move the app off localnet

In the React Native app, point `useWallet` / RPC config at the same Helius devnet URL. The SDK builders are env-agnostic and will pick up whatever connection you pass in.

## What to leave alone

- **Don't move the comp_def JSONs back into `Anchor.toml`** — they're localnet-only test fixtures and devnet doesn't honor `[[test.validator.account]]` at all.
- **Don't restore the `derive_mempool_pda!` / `derive_execpool_pda!` / `derive_cluster_pda!` address constraints** in the queue_computation account structs — the boxing fix relies on never re-reading `mxe_account.cluster` at constraint-evaluation time.
- **Don't downgrade arcium-anchor below 0.9.7** — the comp_def_offset constants in `pda.ts` (`COMP_DEF_OFFSET_INIT_MEMBER_SCORE = 1481970775`, etc.) are `sha256("init_member_score_v2")` and won't match older naming.

## Troubleshooting cheatsheet

| Symptom | Cause | Fix |
|---|---|---|
| `ClusterNotSet (6029)` | MXE not initialized on this cluster, OR `Arcium.toml [clusters.devnet] offset` doesn't match what's on-chain | rerun `arcium init-mxe`, fix Arcium.toml |
| `InvalidComputationDefinition (6007)` | comp_def_account doesn't exist or wasn't finalized | rerun `setup-arcium-*.ts` against devnet |
| `Account does not exist or has no data` for MXE PDA | Step 4 (`init-mxe`) wasn't run on devnet | run step 4 |
| `AccountNotInitialized` for sign_pda_account | Step 5 wasn't run | run step 5 |
| Chunk upload hangs on "blockhash not found" | RPC rate limit | upgrade Helius tier or throttle uploads |
| Callback never lands (10+ minutes) on devnet | Could be real — ARX cluster busy. Check `getSignaturesForAddress` on the computation_account | escalate to Arcium discord with the computation_offset |

## Context: what was fixed to get here

See commits `93eea3a..e5b9211` for the full sequence. Two non-obvious blockers stand out:

1. **BPF stack overflow in `try_accounts`.** Several queue_computation account structs (`InitMemberScore`, `ResetMemberScore`, `RevealMemberScore`, `RecordPrivateLeagueWinV2`, `InitPrivateMarketState`, `RevealPrivateMarket`) compiled to `try_accounts` functions whose frame exceeded BPF's 4096-byte budget by 8–568 bytes. The overflow corrupted the deserialized `mxe_account`, making its `cluster: Option<u32>` field read as `None` and causing `derive_*_pda!(mxe_account, ClusterNotSet)` to error with `ClusterNotSet (6029)`. Fix: `Box<Account<...>>` on every heavy Arcium account field.
2. **Genesis-loaded comp_defs.** The previous workflow snapshotted `init_*_comp_def.json` into `Anchor.toml` for localnet boot speed, but Arcium 0.9.7 rejects those at `queue_computation` time with `InvalidComputationDefinition (6007)`. The fix is to remove the genesis entries and always run `setup-arcium-*.ts` against the running cluster — which is the supported devnet flow anyway.
