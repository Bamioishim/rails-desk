import { createOwnerSession, rotateOwnerKey } from "@/lib/server/desk";
import { ownerCookie, ownerCredential } from "@/lib/server/session";
import { fail, limit, ok, options } from "@/lib/server/http";

export const OPTIONS = options;

/** Owner only: rotate the owner credential and replace the current browser cookie. */
export async function POST(request: Request) {
  try {
    const limited = await limit(request, "key");
    if (limited) return limited;
    const { ownerKey } = await rotateOwnerKey(ownerCredential(request));
    const sessionToken = await createOwnerSession(ownerKey);
    const response = ok({ rotated: true }, 200, request);
    response.headers.append("Set-Cookie", ownerCookie(sessionToken));
    return response;
  } catch (error) {
    return fail(error, request);
  }
}
