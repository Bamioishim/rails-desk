import { getDesk, updateRules, verifyDeskChain } from "@/lib/server/desk";
import { ownerCredential } from "@/lib/server/session";
import { fail, json, limit, ok, options } from "@/lib/server/http";
export const OPTIONS = options;
export async function GET(request: Request) {
  try { const desk = await getDesk(ownerCredential(request)); return ok({ ...desk, verification: verifyDeskChain(desk.receipts) }, 200, request); } catch (e) { return fail(e, request); }
}
/** Owner only: replace the rules { allowedRecipients, maxPerAction, reviewLimit }. */
export async function PUT(request: Request) {
  try { const limited = await limit(request, "key"); if (limited) return limited; const body = await json(request); return ok(await updateRules(ownerCredential(request), body?.rules ?? body), 200, request); } catch (e) { return fail(e, request); }
}
