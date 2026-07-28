// ---------------------------------------------------------------------------
// Identity — how a wallet is named on screen.
//
// Design rule (WIRING-NEEDS.md #6): a base58 address never appears where a
// *person* does. "7xKQ…9mPz placed £20 on Arsenal" reads like a machine; the
// feed, leaderboards, matchups and creator pills are social surfaces and need
// social names.
//
// There is no canonical username registry on-chain yet — the Reputation account
// has no name field — so identity is resolved in layers, best first:
//
//   1. A real name the user owns: .skr / .sol via `useSnsName`, or a Privy
//      handle. Passed in as an override.
//   2. A deterministic terrace pseudonym derived from the pubkey. Stable
//      forever (same wallet always gets the same handle), offline, free.
//
// The pseudonym carries a short hex tag (`@offside_owl` + `4f`) because two
// people sharing a display name in a betting feed is worse than a slightly
// longer handle — you need to know whose take you're tailing. Render the tag
// dimmed next to the handle; `fullHandle()` joins them for single-string slots.
//
// Addresses are still shown for *things* — markets, vaults, tx signatures.
// `truncatePubkey` in useLeaderboard.ts stays for those; it just isn't used
// for people any more.
// ---------------------------------------------------------------------------

// Terrace vernacular — stands, chants, matchday. 64 × 64 = 4,096 combinations
// before the tag, ~1M after. Both lists are powers of two so the modulo is
// unbiased across the hash space.
const ADJECTIVES = [
  "offside", "onside", "northbank", "southstand", "kop", "shed", "stretford", "holte",
  "gallowgate", "clock", "matchday", "boxing", "derby", "cup", "extra", "stoppage",
  "early", "late", "counter", "pressing", "sweeper", "target", "wing", "false",
  "lofted", "curling", "driven", "dipping", "looping", "thumping", "screaming", "cheeky",
  "brave", "steady", "restless", "patient", "ruthless", "gritty", "silky", "clinical",
  "rowdy", "hoarse", "loyal", "travelling", "midweek", "floodlit", "frozen", "muddy",
  "golden", "silver", "amber", "crimson", "cobalt", "emerald", "violet", "copper",
  "iron", "granite", "velvet", "thunder", "lightning", "tempest", "harbour", "hillside",
] as const;

const NOUNS = [
  "owl", "magpie", "canary", "robin", "eagle", "falcon", "raven", "swift",
  "wolf", "fox", "badger", "otter", "stag", "ram", "bull", "lion",
  "terrace", "stand", "corner", "byline", "crossbar", "post", "netting", "turnstile",
  "whistle", "scarf", "kitbag", "bootroom", "dugout", "tunnel", "pitch", "touchline",
  "volley", "header", "nutmeg", "rabona", "chip", "lob", "tackle", "block",
  "keeper", "sweeper", "libero", "playmaker", "poacher", "engine", "anchor", "maestro",
  "chant", "roar", "echo", "drum", "flare", "banner", "mosaic", "pyro",
  "comet", "beacon", "compass", "anvil", "lantern", "quarry", "foundry", "signal",
] as const;

/** FNV-1a — small, fast, and well spread for short base58 strings. */
function hash32(input: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export interface Identity {
  /** "@offside_owl" — always starts with @, never a base58 address. */
  handle: string;
  /** "4f" — short disambiguator. Empty when the name came from a real domain. */
  tag: string;
  /** "OO" — two letters for the avatar. */
  monogram: string;
  /** True when this is a derived pseudonym rather than a name the user owns. */
  derived: boolean;
}

/**
 * Deterministic identity for a wallet. `override` is a real name the user owns
 * (.skr / .sol domain, Privy handle) and always wins.
 */
export function identityOf(pubkey: string | null | undefined, override?: string | null): Identity {
  if (override) {
    const clean = override.replace(/^@/, "").trim();
    return {
      handle: `@${clean}`,
      tag: "",
      monogram: monogramOf(clean),
      derived: false,
    };
  }
  if (!pubkey) return { handle: "@anon", tag: "", monogram: "AN", derived: true };

  // Independent seeds so the two words don't correlate for similar addresses.
  const a = ADJECTIVES[hash32(pubkey, 0x811c9dc5) % ADJECTIVES.length];
  const n = NOUNS[hash32(pubkey, 0x2545f491) % NOUNS.length];
  const tag = (hash32(pubkey, 0x9e3779b9) & 0xff).toString(16).padStart(2, "0");

  return {
    handle: `@${a}_${n}`,
    tag,
    monogram: `${a[0]}${n[0]}`.toUpperCase(),
    derived: true,
  };
}

/** "@offside_owl" — the handle alone, for tight rows. */
export function handleOf(pubkey: string | null | undefined, override?: string | null): string {
  return identityOf(pubkey, override).handle;
}

/** "@offside_owl·4f" — handle plus tag, for single-string slots like share text. */
export function fullHandle(pubkey: string | null | undefined, override?: string | null): string {
  const id = identityOf(pubkey, override);
  return id.tag ? `${id.handle}·${id.tag}` : id.handle;
}

/** Two-letter monogram from an arbitrary display name. */
export function monogramOf(name: string): string {
  const clean = name.replace(/^@/, "").trim();
  const parts = clean.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase() || "AN";
}

// Avatar palette — deterministic per wallet, distinct at small sizes on the
// dark canvas. Same seed as the handle so a person's colour and name always
// travel together.
const AVATAR_COLORS = [
  "#16a34a", "#2563eb", "#7c3aed", "#db2777",
  "#ea580c", "#0891b2", "#ca8a04", "#dc2626",
];

export function avatarColorOf(pubkey: string | null | undefined): string {
  if (!pubkey) return AVATAR_COLORS[0];
  return AVATAR_COLORS[hash32(pubkey, 0x1b873593) % AVATAR_COLORS.length];
}
