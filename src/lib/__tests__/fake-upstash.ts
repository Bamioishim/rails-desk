/**
 * A tiny in-memory stand-in for the Upstash Redis REST API, used only by tests.
 * It implements the commands Rails Desk sends (GET, SET [NX] [PX], MGET, DEL, INCR, PEXPIRE,
 * and EVAL of our three Lua scripts), and adds a small random delay so concurrent requests
 * really interleave.
 */
import { CAS_SAVE_LUA, RELEASE_LOCK_LUA } from "../server/desk-store";
import { RATE_LUA } from "../server/rate-limit";

export function fakeUpstash(opts: { jitterMs?: number } = {}) {
  const data = new Map<string, { v: string; exp?: number }>();
  const now = () => Date.now();
  const get = (k: string) => { const e = data.get(k); if (!e) return null; if (e.exp && e.exp <= now()) { data.delete(k); return null; } return e.v; };
  const set = (k: string, v: string, exp?: number) => data.set(k, { v, exp });
  let calls = 0;
  const exec = (cmd: (string | number)[]): unknown => {
    const [name, ...a] = cmd.map(String);
    switch (name.toUpperCase()) {
      case "GET": return get(a[0]);
      case "MGET": return a.map(get);
      case "DEL": return data.delete(a[0]) ? 1 : 0;
      case "INCR": { const n = Number(get(a[0]) ?? 0) + 1; const e = data.get(a[0]); set(a[0], String(n), e?.exp); return n; }
      case "PEXPIRE": { const e = data.get(a[0]); if (!e) return 0; e.exp = now() + Number(a[1]); return 1; }
      case "SET": {
        const [k, v, ...flags] = a; const up = flags.map((f) => f.toUpperCase());
        if (up.includes("NX") && get(k) !== null) return null;
        const px = up.indexOf("PX"); set(k, v, px >= 0 ? now() + Number(flags[px + 1]) : undefined); return "OK";
      }
      case "EVAL": {
        const [script, nkeys, ...rest] = a; const keys = rest.slice(0, Number(nkeys)); const argv = rest.slice(Number(nkeys));
        if (script === RELEASE_LOCK_LUA) return get(keys[0]) === argv[0] ? (data.delete(keys[0]), 1) : 0;
        if (script === CAS_SAVE_LUA) { if ((get(keys[1]) ?? "0") !== argv[1]) return 0; set(keys[0], argv[0]); exec(["INCR", keys[1]]); return 1; }
        if (script === RATE_LUA) { const n = exec(["INCR", keys[0]]) as number; if (n === 1) exec(["PEXPIRE", keys[0], argv[0]]); return n; }
        throw new Error("unknown script");
      }
      default: throw new Error(`unsupported ${name}`);
    }
  };
  const fetchImpl = async (_url: unknown, init?: { body?: unknown }) => {
    calls++;
    const jitter = opts.jitterMs ?? 3;
    if (jitter) await new Promise((r) => setTimeout(r, Math.random() * jitter));
    try { const result = exec(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ result }), { status: 200 }); }
    catch (e) { return new Response(JSON.stringify({ error: String(e) }), { status: 400 }); }
  };
  return { data, fetch: fetchImpl as unknown as typeof fetch, exec, calls: () => calls };
}
