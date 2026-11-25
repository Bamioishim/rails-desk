"use client";
import { useCallback, useEffect, useState } from "react";

export type DeskRules = { allowedRecipients: string[]; maxPerAction: number; reviewLimit: number; dailySpendCap: number };
export type DeskPolicySnapshot = { rules: DeskRules; checks: { rule: string; passed: boolean; detail: string }[] };
export type DeskProposal = { id: string; createdAt: string; amount: number; recipient: string; reason: string; agent: string; status: "approved" | "needs_review" | "blocked"; reasons: string[]; policy_snapshot?: DeskPolicySnapshot | null; review: null | { decision: "approved" | "refused"; at: string; policySnapshot?: DeskPolicySnapshot }; receiptIds: string[] };
export type DeskReceipt = { index: number; id: string; at: string; proposalId: string; event: string; source?: "app" | "demo"; outcome: "approved" | "needs_review" | "blocked" | "refused"; amount: number; recipient: string; detail: string; policySnapshot?: DeskPolicySnapshot; previousHash: string; hash: string };
export type DeskState = { id: string; name: string; rules: DeskRules; proposals: DeskProposal[]; receipts: DeskReceipt[]; demoReceipts?: DeskReceipt[]; demoVerification?: { valid: boolean; brokenAt: number | null }; storage: "redis" | "file" | "ephemeral"; pending: number; agentKeyHint: string; verification: { valid: boolean; brokenAt: number | null } };
type Keys = { deskId: string; agentKey: string; ownerKey?: string };

const STORAGE_KEY = "rails-desk-keys-v1";
const readKeys = (): Keys | null => { try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } };

async function api<T>(path: string, init: RequestInit & { key?: string } = {}): Promise<T> {
  const { key, ...rest } = init;
  const res = await fetch(path, { ...rest, credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(rest.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status}).`);
  return body as T;
}

/** Owner authentication is an HttpOnly same-site cookie; only the agent key remains in browser storage. */
export function useDesk(pollMs = 0) {
  const [keys, setKeys] = useState<Keys | null>(null);
  const [desk, setDesk] = useState<DeskState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async (k: Keys | null = keys) => {
    if (!k) return;
    try { setDesk(await api<DeskState>("/api/v1/desk")); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [keys]);

  useEffect(() => {
    let live = true;
    const boot = async () => {
      const stored = readKeys();
      if (!stored) { if (live) setReady(true); return; }
      // One-time migration: exchange the legacy localStorage owner key for an HttpOnly cookie.
      if (stored.ownerKey) {
        let cookieEstablished = false;
        try {
          await api("/api/v1/session", { method: "POST", body: JSON.stringify({ ownerKey: stored.ownerKey }) });
          cookieEstablished = true;
          const migrated = { deskId: stored.deskId, agentKey: stored.agentKey };
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
          } catch (storageError) {
            // The cookie is already set. Never leave the legacy owner secret behind if
            // rewriting the record fails; the agent key can remain in memory this session.
            try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage may be unavailable */ }
            throw storageError;
          }
          if (live) setKeys(migrated);
          if (live) await refresh(migrated);
        } catch (e) {
          if (cookieEstablished) {
            try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage may be unavailable */ }
          }
          if (live) {
            setKeys({ deskId: stored.deskId, agentKey: stored.agentKey });
            setError(e instanceof Error ? e.message : "Could not secure the existing owner session.");
          }
        }
      } else {
        const current = { deskId: stored.deskId, agentKey: stored.agentKey };
        if (live) { setKeys(current); await refresh(current); }
      }
      if (live) setReady(true);
    };
    void boot();
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!pollMs || !keys) return; const t = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, pollMs); return () => clearInterval(t); }, [pollMs, keys, refresh]);

  const create = async () => {
    const r = await api<{ agentKey: string; desk: { id: string } }>("/api/v1/desks", { method: "POST", body: JSON.stringify({ name: "My desk" }) });
    const k = { deskId: r.desk.id, agentKey: r.agentKey };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(k)); setKeys(k); await refresh(k);
  };
  const saveRules = async (rules: DeskRules) => { if (!keys) return; await api("/api/v1/desk", { method: "PUT", body: JSON.stringify({ rules }) }); await refresh(); };
  const decide = async (id: string, decision: "approve" | "refuse") => { if (!keys) return; const result = await api<DeskProposal>(`/api/v1/proposals/${id}/decision`, { method: "POST", body: JSON.stringify({ decision }) }); await refresh(); return result; };
  const rotate = async () => { if (!keys) return; const r = await api<{ agentKey: string }>("/api/v1/desk/agent-key", { method: "POST" }); const k = { ...keys, agentKey: r.agentKey }; localStorage.setItem(STORAGE_KEY, JSON.stringify(k)); setKeys(k); await refresh(k); };
  const rotateOwnerSession = async () => { if (!keys) return; await api<{ rotated: boolean }>("/api/v1/session/rotate", { method: "POST" }); };
  const recordDemoEvent = async (body: { amount: number; recipient: string; outcome: "approved" | "needs_review" | "blocked" | "refused"; detail: string; demoId?: string }) => { if (!keys) throw new Error("Create a desk before recording demo activity."); const receipt = await api<DeskReceipt>("/api/v1/demo/events", { method: "POST", body: JSON.stringify(body) }); await refresh(); return receipt; };
  const submitProposal = async (body: { amount: number; recipient: string; reason: string }) => { if (!keys) return null; const r = await api<{ status: string; reasons: string[]; receipt_id: string }>("/api/v1/proposals", { method: "POST", key: keys.agentKey, body: JSON.stringify({ ...body, agent: "Open App" }) }); await refresh(); return r; };
  const forget = async () => {
    try { await api("/api/v1/session", { method: "DELETE" }); }
    finally { localStorage.removeItem(STORAGE_KEY); setKeys(null); setDesk(null); }
  };

  return { ready, keys, desk, error, refresh, create, saveRules, decide, rotate, rotateOwnerSession, submitProposal, recordDemoEvent, forget };
}

export const storageNote: Record<DeskState["storage"], string> = {
  redis: "Saved on the server in Upstash Redis.",
  file: "Saved on the server in data/desks.",
  ephemeral: "Saved on the server in temporary storage. It can be cleared when the server restarts; connect Upstash Redis to keep it.",
};
