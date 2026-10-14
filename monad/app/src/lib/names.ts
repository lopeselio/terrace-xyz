/* Friendly fan names, shared by client components and server pages (no React here). */

const ADJ = ["Loud", "Calm", "Golden", "Late", "Wild", "Cool", "Sharp", "Bold", "Lucky", "Steady", "Fierce", "Quiet", "Clinical", "Brave", "Cheeky", "Cold"];
const NOUN = ["Ultra", "Keeper", "Striker", "Winger", "Gaffer", "Pundit", "Skipper", "Sweeper", "Number 9", "Terrace", "Volley", "Nutmeg", "Rabona", "Chip", "Header", "Libero"];

export function hash(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

/** A friendly, stable name for an account: fans never see a hex address. */
export function fanName(address: string, isAgent = false) {
  const h = hash(address.toLowerCase());
  const name = `${ADJ[h % ADJ.length]} ${NOUN[(h >>> 8) % NOUN.length]}`;
  return isAgent ? `${name} (AI)` : name;
}

/** @handle form of a fan name: "Golden Rabona" → "golden.rabona". */
export const handle = (address: string) => fanName(address).toLowerCase().replace(/\s+/g, ".");
