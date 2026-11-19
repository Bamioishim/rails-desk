import type { Address } from "viem";

export const DEMO_ALLOWED = ["Alex", "Jordan", "Sam"];
export const DEMO_CAP = 20;
export const DEMO_REVIEW_LIMIT = 10;

/** TapeOut circuit names (X Layer) that are on the demo allowlist, e.g. "#1@2.254". */
export function allowedTapeNames(): string[] {
  const raw = process.env.NEXT_PUBLIC_TAPEOUT_ALLOWED ?? "#1@2.254";
  return raw.split(",").map((x) => x.trim()).filter(Boolean);
}

/** Optional wallet addresses for the named demo payees: "Alex=0x...,Jordan=0x...". Unset names pay the connected wallet. */
export function namedPayees(): Record<string, Address> {
  const out: Record<string, Address> = {};
  for (const pair of (process.env.NEXT_PUBLIC_DEMO_PAYEES ?? "").split(",")) {
    const [name, address] = pair.split("=").map((x) => x?.trim());
    if (name && address && /^0x[0-9a-fA-F]{40}$/.test(address)) out[name.toLowerCase()] = address as Address;
  }
  return out;
}
