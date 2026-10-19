/* Money formatting, shared by client components and server routes (no React here). */

/** Dollars from 6-decimal units: "$14.22" (two decimals, as the design does money). */
export const money = (raw: string | number | bigint) => `$${(Number(raw) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
