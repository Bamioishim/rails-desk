import { decide } from "@/lib/server/desk";
import { ownerCredential } from "@/lib/server/session";
import { fail, json, limit, ok, options } from "@/lib/server/http";
export const OPTIONS = options;
/** Owner only: { decision: "approve" | "refuse", note? } for a proposal that needs review. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try { const limited = await limit(request, "key"); if (limited) return limited; const { id } = await ctx.params; const body = await json(request); return ok(await decide(ownerCredential(request), id, body?.decision, body?.note), 200, request); } catch (e) { return fail(e, request); }
}
