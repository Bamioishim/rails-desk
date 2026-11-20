import { bearer, getDesk, updateRules, verifyDeskChain } from "@/lib/server/desk";
import { fail, json, ok, options } from "@/lib/server/http";
export const OPTIONS = options;
export async function GET(request: Request) {
  try { const desk = await getDesk(bearer(request)); return ok({ ...desk, verification: verifyDeskChain(desk.receipts) }); } catch (e) { return fail(e); }
}
/** Owner only: replace the rules { allowedRecipients, maxPerAction, reviewLimit }. */
export async function PUT(request: Request) {
  try { const body = await json(request); return ok(await updateRules(bearer(request), body?.rules ?? body)); } catch (e) { return fail(e); }
}
