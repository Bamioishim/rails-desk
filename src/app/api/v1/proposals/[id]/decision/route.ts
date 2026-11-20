import { bearer, decide } from "@/lib/server/desk";
import { fail, json, ok, options } from "@/lib/server/http";
export const OPTIONS = options;
/** Owner only: { decision: "approve" | "refuse", note? } for a proposal that needs review. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try { const { id } = await ctx.params; const body = await json(request); return ok(await decide(bearer(request), id, body?.decision, body?.note)); } catch (e) { return fail(e); }
}
