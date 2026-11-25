"use client";
/* eslint-disable react-hooks/set-state-in-effect */
import { createContext, useContext, useEffect, useState } from "react";
import { DEFAULT_RAILS, type Rails, type Receipt } from "@/lib/rails";

type Verification = { valid: boolean; brokenAt: number | null; count: number; error?: string };
type Store = {
  rails: Rails;
  setRails: (r: Rails) => void;
  receipts: Receipt[];
  legacyReceipts: Receipt[];
  receiptStatus: Verification | null;
  receiptError: string | null;
  refreshReceipts: () => Promise<void>;
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [rails, setRailsState] = useState<Rails>(DEFAULT_RAILS);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [legacyReceipts, setLegacyReceipts] = useState<Receipt[]>([]);
  const [receiptStatus, setReceiptStatus] = useState<Verification | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const refreshReceipts = async () => {
    try {
      const response = await fetch("/api/receipts", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load the file-backed receipt chain.");
      setReceipts(data.receipts ?? []);
      setReceiptStatus(data.verification ?? null);
      setReceiptError(null);
    } catch (error) {
      setReceiptError(error instanceof Error ? error.message : "Could not load the file-backed receipt chain.");
    }
  };

  useEffect(() => {
    try {
      const storedRails = localStorage.getItem("rails-desk-rails");
      const storedReceipts = localStorage.getItem("rails-desk-receipts");
      if (storedRails) setRailsState(JSON.parse(storedRails));
      // Keep the original browser-only history intact and separate from the file-backed history.
      if (storedReceipts) setLegacyReceipts(JSON.parse(storedReceipts));
    } catch {
      // Existing browser data is left untouched if it cannot be parsed.
    }
    setReady(true);
    void refreshReceipts();
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem("rails-desk-rails", JSON.stringify(rails));
  }, [rails, ready]);

  const setRails = (r: Rails) => setRailsState({
    spendingCap: Math.max(0, Number(r.spendingCap) || 0),
    allowedRecipients: r.allowedRecipients.map((x) => x.trim()).filter(Boolean),
  });

  const value: Store = {
    rails, setRails, receipts, legacyReceipts, receiptStatus, receiptError, refreshReceipts,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const value = useContext(Ctx);
  if (!value) throw new Error("StoreProvider missing");
  return value;
}
