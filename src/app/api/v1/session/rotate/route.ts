import { rotateOwnerSession } from "@/lib/server/desk";
import { ownerCookie, ownerCredential } from "@/lib/server/session";
import { fail, limit, ok, options } from "@/lib/server/http";

export const OPTIONS = options;

/** Replace the current browser session and revoke the previous session ID. */
export async function POST(request: Request) {
  try {
    const limited = await limit(request, "key");
    if (limited) return limited;
    const { sessionKey } = await rotateOwnerSession(ownerCredential(request));
    const response = ok({ rotated: true }, 200, request);
    response.headers.append("Set-Cookie", ownerCookie(sessionKey));
    return response;
  } catch (error) {
    return fail(error, request);
  }
}
