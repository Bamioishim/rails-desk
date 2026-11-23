import { recordReceiptHeadAnchor } from "@/lib/server/desk";
import { ownerCredential } from "@/lib/server/session";
import { fail, json, limit, ok, options } from "@/lib/server/http";
export const OPTIONS = options;
/** Owner-only receipt-head anchor submission; the server verifies the mined X Layer testnet transaction. */
export async function POST(request: Request) {
  try {
    const limited = await limit(request, "key");
    if (limited) return limited;
    return ok(await recordReceiptHeadAnchor(ownerCredential(request), await json(request)), 200, request);
  } catch (e) {
    return fail(e, request);
  }
}
