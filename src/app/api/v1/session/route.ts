import { createOwnerSession, getDesk, revokeOwnerSession } from "@/lib/server/desk";
import { OWNER_COOKIE, ownerCookie } from "@/lib/server/session";
import { fail, limit, ok } from "@/lib/server/http";

function cookieValue(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const raw = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${OWNER_COOKIE}=`))?.slice(OWNER_COOKIE.length + 1);
  if (!raw) return null;
  try { return decodeURIComponent(raw); } catch { return null; }
}

export async function GET(request: Request) {
  try {
    const credential = cookieValue(request);
    if (!credential) return ok({ authenticated: false }, 200, request);
    // Upgrade pre-session owner-key cookies once. New cookies contain revocable session IDs.
    if (credential.startsWith("rd_owner_")) {
      const { sessionKey } = await createOwnerSession(credential);
      const response = ok({ authenticated: true, desk: await getDesk(sessionKey) }, 200, request);
      response.headers.append("Set-Cookie", ownerCookie(sessionKey));
      return response;
    }
    return ok({ authenticated: true, desk: await getDesk(credential) }, 200, request);
  } catch (error) { return fail(error, request); }
}

/** Exchange a legacy browser owner key for a revocable server-side session cookie. */
export async function POST(request: Request) {
  try {
    const limited = await limit(request, "key");
    if (limited) return limited;
    const body = await request.json() as { ownerKey?: unknown };
    if (typeof body.ownerKey !== "string" || !body.ownerKey) return Response.json({ error: "ownerKey is required." }, { status: 400 });
    const { sessionKey } = await createOwnerSession(body.ownerKey);
    const response = ok({ authenticated: true, desk: await getDesk(sessionKey) }, 200, request);
    response.headers.append("Set-Cookie", ownerCookie(sessionKey));
    return response;
  } catch (error) { return fail(error, request); }
}

/** Revoke this browser session server-side, then clear its cookie. */
export async function DELETE(request: Request) {
  try {
    const limited = await limit(request, "key");
    if (limited) return limited;
    const credential = cookieValue(request);
    if (credential) await revokeOwnerSession(credential);
    const response = ok({ authenticated: false }, 200, request);
    response.headers.append("Set-Cookie", ownerCookie("", 0));
    return response;
  } catch (error) {
    const response = fail(error, request);
    response.headers.append("Set-Cookie", ownerCookie("", 0));
    return response;
  }
}
