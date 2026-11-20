import { bearer, rotateAgentKey } from "@/lib/server/desk";
import { fail, ok, options } from "@/lib/server/http";
export const OPTIONS = options;
/** Owner only: issue a new agent key. The old agent key stops working. */
export async function POST(request: Request) { try { return ok(await rotateAgentKey(bearer(request))); } catch (e) { return fail(e); } }
