"use client";
import { useCallback, useEffect, useState } from "react";

export type DeskRules = { allowedRecipients: string[]; maxPerAction: number; reviewLimit: number };
export type DeskProposal = { id: string; createdAt: string; amount: number; recipient: string; reason: string; agent: string; status: "approved" | "needs_review" | "blocked"; reasons: string[]; review: null | { decision: "approved" | "refused"; at: string }; receiptIds: string[] };
export type DeskReceipt = { index: number; id: string; at: string; proposalId: string; event: string; outcome: "approved" | "needs_review" | "blocked" | "refused"; amount: number; recipient: string; detail: string; previousHash: string; hash: string };
export type DeskState = { id: string; name: string; rules: DeskRules; proposals: DeskProposal[]; receipts: DeskReceipt[]; storage: "redis" | "file" | "ephemeral"; pending: number; agentKeyHint: string; verification: { valid: boolean; brokenAt: number | null } };
type Keys = { deskId: string; ownerKey: string; agentKey: string };

const STORAGE_KEY = "rails-desk-keys-v1";
const readKeys = (): Keys | null => { try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } };

async function api<T>(path: string, init: RequestInit & { key?: string } = {}): Promise<T> {
  const { key, ...rest } = init;
  const res = await fetch(path, { ...rest, cache: "no-store", headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(rest.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status}).`);
  return body as T;
}

/** The user's desk: keys live in this browser; rules, proposals and receipts live on the server. */
export function useDesk(pollMs = 0) {
  const [keys, setKeys] = useState<Keys | null>(null);
  const [desk, setDesk] = useState<DeskState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async (k: Keys | null = keys) => {
    if (!k) return;
    try { setDesk(await api<DeskState>("/api/v1/desk", { key: k.ownerKey })); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [keys]);

  useEffect(() => { const t = setTimeout(() => { const k = readKeys(); setKeys(k); setReady(true); if (k) void refresh(k); }, 0); return () => clearTimeout(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!pollMs || !keys) return; const t = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, pollMs); return () => clearInterval(t); }, [pollMs, keys, refresh]);

  const create = async () => {
    const r = await api<{ ownerKey: string; agentKey: string; desk: { id: string } }>("/api/v1/desks", { method: "POST", body: JSON.stringify({ name: "My desk" }) });
    const k = { deskId: r.desk.id, ownerKey: r.ownerKey, agentKey: r.agentKey };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(k)); setKeys(k); await refresh(k);
  };
  const saveRules = async (rules: DeskRules) => { if (!keys) return; await api("/api/v1/desk", { method: "PUT", key: keys.ownerKey, body: JSON.stringify({ rules }) }); await refresh(); };
  const decide = async (id: string, decision: "approve" | "refuse") => { if (!keys) return; await api(`/api/v1/proposals/${id}/decision`, { method: "POST", key: keys.ownerKey, body: JSON.stringify({ decision }) }); await refresh(); };
  const rotate = async () => { if (!keys) return; const r = await api<{ agentKey: string }>("/api/v1/desk/agent-key", { method: "POST", key: keys.ownerKey }); const k = { ...keys, agentKey: r.agentKey }; localStorage.setItem(STORAGE_KEY, JSON.stringify(k)); setKeys(k); await refresh(k); };
  const testProposal = async (body: { amount: number; recipient: string; reason: string }) => { if (!keys) return null; const r = await api<{ status: string; reasons: string[]; receipt_id: string }>("/api/v1/proposals", { method: "POST", key: keys.agentKey, body: JSON.stringify({ ...body, agent: "test button" }) }); await refresh(); return r; };
  const forget = () => { localStorage.removeItem(STORAGE_KEY); setKeys(null); setDesk(null); };

  return { ready, keys, desk, error, refresh, create, saveRules, decide, rotate, testProposal, forget };
}

export const storageNote: Record<DeskState["storage"], string> = {
  redis: "Saved on the server in Upstash Redis.",
  file: "Saved on the server in data/desks.",
  ephemeral: "Saved on the server in temporary storage. It can be cleared when the server restarts; connect Upstash Redis to keep it.",
};
