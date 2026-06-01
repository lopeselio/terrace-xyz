/**
 * Translate raw blockchain / MPC errors into messages a football fan understands.
 *
 * The underlying systems (Solana RPC, Arcium MPC, Anchor program) all surface
 * errors with developer-facing strings: `Custom(6000)`, `Blockhash not found`,
 * `InstructionError`, `0x189d`. Those make sense in a dev console — they make
 * the app feel broken and intimidating to anyone else.
 *
 * Every `setError(e)` / `showToast(e)` in the app should route through here.
 * The raw error is still logged via `console.warn` for debugging — only the
 * user-facing string is rewritten.
 */
export function friendlyError(e: unknown, fallback?: string): string {
  const raw = e instanceof Error ? e.message : String(e ?? "");
  console.warn("[friendlyError] raw:", raw);

  // Network / RPC / blockhash / timeout
  if (/blockhash|expired|fee\s*payer|recent.?blockhash/i.test(raw)) {
    return "Solana is busy — please try again in a moment.";
  }
  if (/timed out|timeout|network|connection|fetch failed|socket/i.test(raw)) {
    return "Connection issue — check your internet and try again.";
  }

  // Insufficient funds
  if (/insufficient.*lamports|insufficient.*funds|0x1\b/i.test(raw)) {
    return "Not enough SOL on this wallet to cover the network fee.";
  }
  if (/insufficient.*usdc|InsufficientFunds|InsufficientBalance/i.test(raw)) {
    return "Not enough USDC for this stake.";
  }

  // Wallet not connected / sign rejected
  if (/wallet not connected|sign(Transaction|Message)|public[ -]?key.*null|publicKey is null/i.test(raw)) {
    return "Please connect your wallet to continue.";
  }
  if (/user rejected|cancel(l?ed)?|dismissed|denied/i.test(raw)) {
    return "Cancelled.";
  }

  // Arcium MPC failure paths — abstract away the tech
  if (/AbortedComputation|Custom\(6000\)|Custom\(6026\)|verify[_ ]?output|verify failed/i.test(raw)) {
    return "Private computation failed — please try again.";
  }
  if (/0x189d|InvalidArguments|Custom\(6301\)/i.test(raw)) {
    return "Couldn't queue this action — please reload and try again.";
  }
  if (/MXE|mxe account|cluster.*set|ClusterNotSet/i.test(raw)) {
    return "Private features aren't available right now — please try again later.";
  }

  // Anchor address / seed / constraint mismatches → almost always means
  // stale client state. User-friendly: just ask them to refresh.
  if (/address constraint|seeds constraint|account.*not initialized|AccountNotInitialized/i.test(raw)) {
    return "Your league spot isn't ready yet — pull to refresh and try again.";
  }
  if (/already in use|already exists|AlreadyInUse|account already initialized/i.test(raw)) {
    return "This is already done.";
  }

  // Domain-specific Terrace errors (rewrite the worst offenders)
  if (/bet secret not found/i.test(raw)) {
    return "Couldn't find your bet receipt — please use the same wallet you placed the bet from.";
  }
  if (/MarketNotOpen|market is not open/i.test(raw)) {
    return "This market is closed.";
  }
  if (/MarketExpired|market has passed/i.test(raw)) {
    return "This market has ended.";
  }
  if (/BetTooSmall|below the minimum/i.test(raw)) {
    return "Stake is too small — minimum is $0.10.";
  }
  if (/AlreadyRevealed/i.test(raw)) {
    return "Already revealed.";
  }
  if (/NotYetRevealed|not yet revealed/i.test(raw)) {
    return "This bet can't be scored — its outcome wasn't sealed by Arcium. Skip and try another one.";
  }
  if (/AlreadyClaimed/i.test(raw)) {
    return "You've already claimed this.";
  }
  if (/BetDidNotWin/i.test(raw)) {
    return "This bet wasn't a winner.";
  }
  if (/NotAMember|not a member/i.test(raw)) {
    return "Join the league to take this action.";
  }
  if (/LeagueFull/i.test(raw)) {
    return "This league is full.";
  }
  // League join — wrong/missing address
  if (/league not found/i.test(raw)) {
    return "Hmm, no league at that link. Double-check with whoever created it. Sometimes a character gets lost in the paste.";
  }
  // Invalid base58 / pubkey format — user pasted junk or a partial link
  if (/non[- ]?base58|invalid (public[- ]?key|base58|address)|expected.*base58/i.test(raw)) {
    return "That link doesn't look right. Get a fresh invite from the friend who created the league.";
  }

  // Catch-all: never expose raw program errors
  if (/Custom\(\d+\)|InstructionError|0x[0-9a-f]{2,}|Program.*failed|simulation failed/i.test(raw)) {
    return fallback ?? "Something went wrong. Please try again.";
  }

  // If the original message is short and doesn't look like a stack trace or
  // tech identifier, pass it through (e.g. "Bet placed!"). Otherwise generic.
  if (raw.length > 0 && raw.length < 120 && !raw.includes("\n") && !/^\s*Error:/.test(raw)) {
    return raw;
  }

  return fallback ?? "Something went wrong. Please try again.";
}
