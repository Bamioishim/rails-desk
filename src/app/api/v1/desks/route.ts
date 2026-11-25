import { createDesk } from "@/lib/server/desk";
import { ownerCookie } from "@/lib/server/session";
import { fail, json, limit, ok, options } from "@/lib/server/http";
export const OPTIONS = options;

/** Create a desk. The owner credential is set as an HttpOnly cookie; only the agent key is returned. */
export async function POST(request: Request) {
  try {
    const limited = await limit(request, "desk-create");
    if (limited) return limited;
    const body = await json(request);
    const created = await createDesk(typeof body?.name === "string" ? body.name : undefined);
    const response = ok({ desk: created.desk, agentKey: created.agentKey }, 201, request);
    response.headers.append("Set-Cookie", ownerCookie(created.ownerSession));
    return response;
  } catch (e) { return fail(e, request); }
}
