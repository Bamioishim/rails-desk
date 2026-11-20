import { bearer, propose } from "@/lib/server/desk";
import { fail, json, limit, ok, options } from "@/lib/server/http";
export const OPTIONS = options;
/**
 * An agent proposes a payment: { amount, recipient, reason, agent? }.
 * Returns status approved | needs_review | blocked, the reasons, and a receipt id.
 */
export async function POST(request: Request) {
  try { const limited = await limit(request, "key"); if (limited) return limited; return ok(await propose(bearer(request), await json(request)), 201, request); } catch (e) { return fail(e, request); }
}
