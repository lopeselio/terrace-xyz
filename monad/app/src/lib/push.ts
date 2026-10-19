/*
 * Push notification settings, shared by the app and /api/push. A fan turns pushes on per device;
 * each device's subscription is stored in Azure (partition = fan, row = hash of the push endpoint).
 */
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

export type PushPrefs = { results: boolean; challenges: boolean; followers: boolean };
export const DEFAULT_PREFS: PushPrefs = { results: true, challenges: true, followers: true };
export const PREF_LABELS: { key: keyof PushPrefs; label: string; sub: string }[] = [
  { key: "results", label: "Results", sub: "Your bets and 1v1s once the match is settled" },
  { key: "challenges", label: "Challenges", sub: "A mate challenges you, takes on or turns down your 1v1" },
  { key: "followers", label: "Followers", sub: "Someone follows you" },
];

/** Row key for a device: the push endpoint is long and full of slashes, its hash isn't. */
export const deviceKey = (endpoint: string) => bytesToHex(sha256(utf8ToBytes(endpoint)));

/** The exact note a fan signs to save this device's push settings; the server rebuilds and checks it. */
export const pushNote = (address: string, device: string, prefs: PushPrefs, at: number) =>
  `Terrace notifications\nfan:${address.toLowerCase()}\ndevice:${device}\nresults:${+prefs.results} challenges:${+prefs.challenges} followers:${+prefs.followers}\nat:${at}`;
