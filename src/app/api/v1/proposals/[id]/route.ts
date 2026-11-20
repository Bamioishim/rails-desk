import { bearer, getProposal } from "@/lib/server/desk";
import { fail, ok, options } from "@/lib/server/http";
export const OPTIONS = options;
/** Agent or owner: read a proposal, e.g. to see if a needs_review payment was approved. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try { const { id } = await ctx.params; return ok(await getProposal(bearer(request), id), 200, request); } catch (e) { return fail(e, request); }
}
