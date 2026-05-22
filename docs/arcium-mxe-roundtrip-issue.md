# POST-MORTEM — Arcium `Enc<Mxe, T>` "roundtrip garbage" (RESOLVED 2026-05-22)

> **TL;DR of the post-mortem**: not a cluster bug, not a key issue, not the
> 0.8 → 0.9 migration. The garbage decoded values we saw on devnet were
> caused by a **client-side cipher mismatch**: our e2e was encrypting
> `Enc<Shared, u64>` bet outcomes with a hand-rolled XOR + SHA256 cipher
> instead of `@arcium-hq/client`'s RescueCipher. Arcis couldn't decode
> the resulting bytes as BN254 field elements; devnet ARX nodes silently
> decoded them to noise, localnet ARX nodes correctly rejected at input
> deserialization with `Failed to convert bytes to field element`.
>
> Verified after the fix: e2e green on both **localnet** (10/10, ~34s)
> and **devnet** (10/10, ~39s); chained-MPC `total_score = 1`.
>
> See the fix commit: `fix(e2e): use @arcium-hq/client RescueCipher for
> Enc<Shared, u64>`. The investigative log below is kept for historical
> reference — every hypothesis in "What we ruled out" / "Suspect
> hypotheses" was wrong.

---

# Arcium `Enc<Mxe, T>` roundtrip producing garbage for non-`u64` types

> Filed by: Terrace team
> Date: 2026-05-20
> Status: Reproducible, blocking our "fully private league scoring" feature on devnet

## TL;DR

On Solana devnet with `arcium` CLI 0.9.7 / `arcis` 0.8.5, **`Enc<Mxe, u64>` roundtrips correctly** (init → reveal of `0u64` always yields `0`). **Every other `Enc<Mxe, T>` we've tried** — `[u64; 2]`, `u8`, `struct { u8 }`, `struct { u64, u64 }` — **decodes to apparent garbage** when revealed or when consumed as input to a downstream circuit. Callbacks land cleanly, signed outputs verify, ciphertext bytes on-chain look valid — but the decoded plaintext value is wrong.

We've systematically ruled out the canonical pattern mistakes by following `arcium-hq/examples` character-for-character. Asking whether this is a known issue on this MXE cluster, an `arcis-0.8.5` SDK bug, or something specific to our `arcium init-mxe` setup.

## Environment

| Field | Value |
|---|---|
| Network | Solana **devnet** |
| RPC | Helius devnet |
| Program ID | `8dDXHX1x6didMogjFcMCNL6ZoY4XkP2RkSCKcCiaQssF` |
| MXE PDA | `XRUpqzUgydb7N7ygz3X568LmsRn3VkDGQ5Regr2NR51` |
| `arcium` CLI | 0.9.7 |
| `arcis` | 0.8.5 |
| `arcium-anchor` | 0.9.7 |
| Cluster offset | (default) |
| Wallet authority | `HDDYb8NAzwMVuobJJD4UCYzeFNgSawJ2vJhPMfFLBiLB` |

## Product context (one paragraph)

Terrace is a Solana football prediction-markets app. We use Arcium for two privacy features:

1. **Encrypted private prediction markets** — a small group bets on a binary outcome. Each bettor's pick stays encrypted via `Enc<Shared, BetCtx>` during the market; the MPC updates encrypted totals (`Enc<Mxe, Totals>`). At settlement, the MPC reveals totals → market.outcome.
2. **Fully private per-member league scores** — each member of a private league has an `Enc<Mxe, u64>` running score. When they win a bet, an MPC circuit reads their sealed outcome (from the bet PDA) and conditionally increments the encrypted score *without* anyone learning the outcome from the chain.

Feature 2 (chained-MXE scoring) is what's failing — the score MPC sees the sealed outcome decode to a value other than what the bet circuit sealed.

## What works ✅ — `Enc<Mxe, u64>` scalar chain

The per-member score chain is the only chained-Mxe pattern we have that roundtrips correctly:

```rust
#[instruction]
pub fn init_member_score_v2(mxe: Mxe) -> Enc<Mxe, u64> {
    mxe.from_arcis(0u64)
}

#[instruction]
pub fn increment_member_score_v2(score_ctx: Enc<Mxe, u64>) -> Enc<Mxe, u64> {
    let score = score_ctx.to_arcis();
    score_ctx.owner.from_arcis(score + 1)
}

#[instruction]
pub fn reveal_member_score_v2(score_ctx: Enc<Mxe, u64>) -> u64 {
    let score = score_ctx.to_arcis();
    score.reveal()
}
```

Test result: init → reveal yields `0u64`. After any number of `increment_member_score_v2` callbacks, reveal yields the correct count. Callbacks land in ~5s on devnet. **This works end-to-end.**

## What's broken ❌ — every other `Enc<Mxe, T>` we've tried

We've iterated through four variants of the bet/reveal/score circuits. Each produces clean callbacks but wrong decoded values inside the MPC.

### Attempt 1 (v2): raw `[u64; 2]` array

```rust
#[instruction]
pub fn init_private_market_state_v2(mxe: Mxe) -> Enc<Mxe, [u64; 2]> {
    mxe.from_arcis([0u64, 0u64])
}

#[instruction]
pub fn place_private_bet_v2(
    bet_ctx: Enc<Shared, (u8, u64)>,
    totals_ctx: Enc<Mxe, [u64; 2]>,
) -> Enc<Mxe, [u64; 2]> {
    let (outcome, amount) = bet_ctx.to_arcis();
    let mut totals = totals_ctx.to_arcis();
    totals[outcome as usize] += amount;
    totals_ctx.owner.from_arcis(totals)
}

#[instruction]
pub fn reveal_private_market_v2(totals_ctx: Enc<Mxe, [u64; 2]>) -> (u64, u64) {
    let totals = totals_ctx.to_arcis();
    (totals[0].reveal(), totals[1].reveal())
}
```

**Expected after one bet on outcome=1, amount=100000**: reveal returns `(no=0, yes=100000)`.
**Actual**: reveal returns garbage like `(no=3928873539334509218, yes=18393829292800604447)` — non-deterministic across runs.

### Attempt 2 (v3): `Enc<Mxe, u8>` raw scalar as a chained input

To preserve confidentiality at scoring, we made the bet circuit emit a second output: the bettor's outcome re-encrypted under MXE (`Enc<Mxe, u8>`). A downstream score circuit reads it via `.account()` + the stored nonce:

```rust
#[instruction]
pub fn place_private_bet_v3(
    bet_ctx: Enc<Shared, (u8, u64)>,
    totals_ctx: Enc<Mxe, [u64; 2]>,
) -> (Enc<Mxe, [u64; 2]>, Enc<Mxe, u8>) {
    let (outcome, amount) = bet_ctx.to_arcis();
    let mut totals = totals_ctx.to_arcis();
    totals[outcome as usize] += amount;
    let new_totals = totals_ctx.owner.from_arcis(totals);
    let sealed_outcome = Mxe::get().from_arcis(outcome); // ← seal AFTER totals update
    (new_totals, sealed_outcome)
}

#[instruction]
pub fn record_private_league_win_v3(
    bet_outcome_ctx: Enc<Mxe, u8>,
    winning_outcome: u8,
    score_ctx: Enc<Mxe, u64>,
) -> Enc<Mxe, u64> {
    let outcome = bet_outcome_ctx.to_arcis();
    let score = score_ctx.to_arcis();
    let increment = if outcome == winning_outcome { 1u64 } else { 0u64 };
    score_ctx.owner.from_arcis(score + increment)
}
```

Anchor program callback writes the sealed ciphertext + nonce to a `PrivateBetRecord` PDA. The score instruction passes it back via:
```rust
.plaintext_u128(mxe_outcome_nonce)
.account(private_bet_record.key(), MXE_OUTCOME_OFFSET, 32)
```

**Expected**: bettor bet outcome=1, winning=1 → increment=1.
**Actual**: callback lands cleanly in ~5s, but the decoded `outcome` inside `record_private_league_win_v3` is NOT 1 → `increment=0` → revealed score stays 0.

### Attempt 3 (v4): explicit `seal_mxe: Mxe` parameter instead of `Mxe::get()`

Same circuit shape but the second `from_arcis` uses an explicit `Mxe` parameter passed via ArgBuilder (matching `init_private_market_state_v2`'s pattern):

```rust
#[instruction]
pub fn place_private_bet_v4(
    bet_ctx: Enc<Shared, (u8, u64)>,
    totals_ctx: Enc<Mxe, [u64; 2]>,
    seal_mxe: Mxe,
) -> (Enc<Mxe, [u64; 2]>, Enc<Mxe, u8>) {
    let (outcome, amount) = bet_ctx.to_arcis();
    let mut totals = totals_ctx.to_arcis();
    totals[outcome as usize] += amount;
    let new_totals = totals_ctx.owner.from_arcis(totals);
    let sealed_outcome = seal_mxe.from_arcis(outcome);
    (new_totals, sealed_outcome)
}
```

**Result**: identical to v3 — callback lands, but decoded outcome is wrong.

### Attempt 4 (v5): canonical Arcium pattern — named structs, seal-first

After studying `arcium-hq/examples` we noticed **every Mxe-encrypted state in the examples uses a named struct**, never raw arrays or raw scalars. We rewrote everything to match (voting's `VoteStats`, auction's `AuctionState`, blackjack's `Hand` patterns):

```rust
pub struct Totals { pub no: u64, pub yes: u64 }
pub struct SealedOutcome { pub value: u8 }
pub struct BetCtx { pub outcome: u8, pub amount: u64 }

#[instruction]
pub fn init_private_market_state_v3(mxe: Mxe) -> Enc<Mxe, Totals> {
    mxe.from_arcis(Totals { no: 0u64, yes: 0u64 })
}

#[instruction]
pub fn place_private_bet_v5(
    bet_ctx: Enc<Shared, BetCtx>,
    totals_ctx: Enc<Mxe, Totals>,
    seal_mxe: Mxe,
) -> (Enc<Mxe, Totals>, Enc<Mxe, SealedOutcome>) {
    let bet = bet_ctx.to_arcis();
    // Seal FIRST, before any other ops touch the outcome share
    let sealed_outcome = seal_mxe.from_arcis(SealedOutcome { value: bet.outcome });
    let mut totals = totals_ctx.to_arcis();
    if bet.outcome == 1u8 { totals.yes += bet.amount; } else { totals.no += bet.amount; }
    let new_totals = totals_ctx.owner.from_arcis(totals);
    (new_totals, sealed_outcome)
}

#[instruction]
pub fn reveal_private_market_v3(totals_ctx: Enc<Mxe, Totals>) -> Totals {
    let totals = totals_ctx.to_arcis();
    Totals { no: totals.no, yes: totals.yes }.reveal()
}

#[instruction]
pub fn record_private_league_win_v5(
    sealed_outcome_ctx: Enc<Mxe, SealedOutcome>,
    winning_outcome: u8,
    score_ctx: Enc<Mxe, u64>,
) -> Enc<Mxe, u64> {
    let sealed = sealed_outcome_ctx.to_arcis();
    let score = score_ctx.to_arcis();
    let increment = if sealed.value == winning_outcome { 1u64 } else { 0u64 };
    score_ctx.owner.from_arcis(score + increment)
}
```

Both the bet circuit (seal-first ordering, struct types, explicit `seal_mxe: Mxe`) and the score circuit (struct input, `Enc<Mxe, SealedOutcome>`) now match canonical patterns from `voting`, `sealed_bid_auction`, and `blackjack`.

**Expected**: reveal returns `Totals { no: 0, yes: 100000 }`; score callback computes `increment=1`.
**Actual**: reveal returns garbage `(no=9350412286222538212, yes=16038520087236681209)`; score callback yields `increment=0`; revealed score stays 0.

## Concrete on-chain evidence

From this run (Option-A v5, deploy sig `2DsuYFY8...`):

### Market PDA `DnAuuKesgB9Ezro5sfn5rRW8mrYzfdBqU15tELyq8dgU`

Decoded layout:

```
outcome:       Some(1)
total_volume:  u64::MAX (saturating overflow from yes_vol + no_vol)
yes_volume:    16,038,520,087,236,681,209   ← should be 100000
no_volume:     9,350,412,286,222,538,212    ← should be 0
```

These values are written by `reveal_private_market_callback` from the MPC output. Different runs give different garbage — looks like uninitialised/random bytes, not deterministic corruption.

### `PrivateBetRecord` PDA `EipoEWT4NBYKHnMq8Pwpi32s4q2CfhzxX9wgKJs5EWAE`

```
mxe_outcome_sealed: true
mxe_outcome_ct:     0x83cdfb9fa67d2db57c657835dcf5d8054db3d92d22e34f0ca4090e7f5df6f908
mxe_outcome_nonce:  32822020536594869961620426153634
```

Ciphertext is non-zero, looks like a real Mxe ciphertext, nonce matches what the bet callback wrote.

### `PrivateMemberScore` PDA `4N9RcUvwza1ptj3GiT5RJ95aPuFQGmywLV7aM93fJ7Pn`

After the score callback ran successfully (`encrypted_score` ciphertext changed from init state):

```
revealed via reveal_member_score_v2:  0
```

Score went `E(0)` → `E(0+0)` → revealed as `0`. The MPC computed `increment=0`, meaning `outcome != 1` inside the circuit.

## What we ruled out

| # | Hypothesis | How tested | Result |
|---|---|---|---|
| 1 | Missing `.x25519_pubkey()` for Shared input | Verified ArgBuilder order matches circuit signature for every param | ✓ correct |
| 2 | Wrong account byte offset | Manual byte-by-byte verification of `PrivateBetRecord` layout, matched `MXE_OUTCOME_OFFSET` | ✓ correct |
| 3 | Nonce reuse | Each Mxe seal uses a fresh nonce derived from `computation_offset` | ✓ unique |
| 4 | `outcome as usize` munging the MPC share | Tried sealing **before** the secret-index op (v5) | ✗ no change |
| 5 | `Mxe::get()` vs `mxe: Mxe` parameter producing different keys | Tried both (v3 = `Mxe::get()`, v4/v5 = `mxe: Mxe` param) | ✗ no change |
| 6 | Tuple-vs-struct reveal mismatch | Tried both `(u64, u64)` tuple reveal and `Totals` struct reveal | ✗ no change |
| 7 | Raw `[u64; N]` array semantics in arcis | Replaced with named struct (`Totals { no, yes }`) | ✗ no change |
| 8 | Multi-output tuple field ordering | Confirmed `o.field_0.field_0` (totals) and `o.field_0.field_1` (sealed) match circuit declaration order | ✓ correct, matches blackjack's `o.0`/`o.1`/`o.2`/`o.3` pattern |
| 9 | Callback signed-output verification failing | `output.verify_output()` always returns `Ok(...)` | ✓ verifies |
| 10 | Account writability in callback | All Mxe state accounts marked `mut` in `callback_accounts!` struct AND passed as `CallbackAccount { is_writable: true }` in `queue_computation` | ✓ correct |

## Suspect hypotheses (in our order of likelihood)

1. **MXE collective key issue specific to this program.** Maybe `arcium init-mxe` wrote a malformed key for this MXE PDA, or the cluster's key shares are out of sync. Encryption produces valid-looking ciphertexts (random-looking bytes), but decryption yields garbage. The `Enc<Mxe, u64>` chain happens to "work" because `u64 = 0` is the default/null result of failed decryption — masking the bug for that specific case.

2. **`arcis-0.8.5` runtime mismatch with devnet ARX nodes.** Possible if the cluster runs a different arcis version than what we compile with. Multi-field types and arrays might serialize/deserialize differently across versions.

3. **A bug in `arcis-0.8.5`'s handling of non-`u64`-scalar Mxe types** — unlikely since the canonical example patterns we now match are presumably tested in arcium's own CI.

## Asks for the Arcium team

1. **Is this a known issue on devnet?** Have other users hit `Enc<Mxe, T>` (non-`u64`) producing garbage?
2. **Can we get the MXE re-keyed or migrated** to a known-good cluster?
3. **Is the `arcium-anchor 0.9.7` SDK** compatible with the devnet ARX nodes' runtime, or do we need to pin a different version?
4. **Minimal repro available** — we can produce a 30-line repro circuit + script if useful. Just say the word.

## Secondary issue: no `close` instruction for `ComputationDefinitionRaw` PDAs

Each `init_raw_circuit_acc` + `upload_circuit` + `finalize_computation_definition` flow rent-locks ~1.5–7.4 SOL into a `ComputationDefinitionRaw` PDA per circuit (scales with circuit size). The Arcium IDL has **no `close_raw_circuit_acc` or `close_comp_def` instruction**:

```
$ grep -i close arcium-client-0.9.7/idls/arcium.json
"name": "close_key_recovery"                          (irrelevant)
"name": "close_permissioned_recovery_peers_account"   (irrelevant)
```

After multiple iterations of our circuits (4 attempts) we have **~24 SOL of rent permanently locked** in orphaned raw PDAs from earlier attempts, plus ~9 SOL on the current set. On devnet this is cosmetic but annoying; on mainnet it would be a real cost.

Would the team consider adding a `close_raw_circuit_acc(authority, comp_def_raw, recipient) -> transfers rent to recipient` instruction? The authority check could just be the comp_def's original signer.

## Reproducing locally

1. Clone our circuit code (just the relevant subset):
   - `encrypted-ixs/src/lib.rs` — 110 lines, contains all 7 circuits (v3 init/reveal, v5 bet/record, v2 init/increment/reveal score)
   - `programs/terrace/src/instructions/private.rs` — bet handler with ArgBuilder
   - `programs/terrace/src/instructions/league_private.rs` — score handler with ArgBuilder
2. Build: `arcium build` (succeeds with one stack-frame warning from `arcium_client::idl::arcium::utils::Account::try_from` — pre-existing, not from our code)
3. Deploy via `solana program deploy --use-rpc`
4. Run setup scripts (uploads 7 comp_defs):
   - `scripts/setup-arcium-private-market.ts` — uploads `init_private_market_state_v3`, `place_private_bet_v5`, `reveal_private_market_v3`
   - `scripts/setup-arcium-league-v2.ts` — uploads `init_member_score_v2`, `increment_member_score_v2`, `reveal_member_score_v2`, `record_private_league_win_v5`
5. Run e2e: `scripts/test-private-league-v2-e2e.ts`. Expected: `total_score = 1`. Actual: `total_score = 0` + garbage volumes.

Happy to share the exact files (private repo) with any specific Arcium engineer who wants to look — just need a GitHub handle or a way to add them. Or we can paste the full sources here if that's preferred.
