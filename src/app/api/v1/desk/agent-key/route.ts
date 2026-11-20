import { bearer, rotateAgentKey } from "@/lib/server/desk";
import { fail, limit, ok, options } from "@/lib/server/http";
export const OPTIONS = options;
/** Owner only: issue a new agent key. The old agent key stops working. */
export async function POST(request: Request) { try { const limited = await limit(request, "key"); if (limited) return limited; return ok(await rotateAgentKey(bearer(request)), 200, request); } catch (e) { return fail(e, request); } }
