import type { Hex } from "viem";
import type { PolicyOutputs } from "./policy-circuit";

/** A receipt whose payment happened on X Layer testnet. The transaction is the durable record. */
export type OnchainReceipt = {
  id: string; timestamp: string; recipient: string; payTo: string; amount: number; reason: string;
  decision: "Executed on X Layer testnet"; circuit: PolicyOutputs; circuitSource: "local" | "onchain";
  tapeIdentity?: string; anchor: Hex; txHash: Hex; chainId: number; asset: string; units: string; blockNumber: string;
};

const KEY = "rails-desk-xlayer-receipts";

export function loadOnchainReceipts(): OnchainReceipt[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}
export function saveOnchainReceipt(receipt: OnchainReceipt) {
  const list = [...loadOnchainReceipts(), receipt].slice(-50);
  localStorage.setItem(KEY, JSON.stringify(list));
  return list;
}
