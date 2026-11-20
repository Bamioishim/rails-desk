import { bearer, propose } from "@/lib/server/desk";
import { fail, json, ok, options } from "@/lib/server/http";
export const OPTIONS = options;
/**
 * An agent proposes a payment: { amount, recipient, reason, agent? }.
 * Returns status approved | needs_review | blocked, the reasons, and a receipt id.
 */
export async function POST(request: Request) {
  try { return ok(await propose(bearer(request), await json(request)), 201); } catch (e) { return fail(e); }
}
