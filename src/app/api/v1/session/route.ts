import { createOwnerSession, DeskError, getDesk, revokeOwnerSession } from "@/lib/server/desk";
import { ownerCookieCredential, ownerCredential, ownerCookie } from "@/lib/server/session";
import { fail, isSameOriginRequest, limit, ok } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const cookieCredential = ownerCookieCredential(request);
    const credential = cookieCredential ?? ownerCredential(request);
    if (!credential) return ok({ authenticated: false }, 200, request);
    const desk = await getDesk(credential);
    // Upgrade cookies issued by the previous version, which contained the raw owner key.
    if (cookieCredential?.startsWith("rd_owner_")) {
      const limited = await limit(request, "session");
      if (limited) return limited;
      const sessionToken = await createOwnerSession(cookieCredential);
      const response = ok({ authenticated: true, desk }, 200, request);
      response.headers.append("Set-Cookie", ownerCookie(sessionToken));
      return response;
    }
    return ok({ authenticated: true, desk }, 200, request);
  } catch (error) { return fail(error, request); }
}

/** Exchange a legacy owner key for a revocable, server-validated browser session. */
export async function POST(request: Request) {
  try {
    if (!isSameOriginRequest(request)) return Response.json({ error: "A same-origin request is required." }, { status: 403 });
    const limited = await limit(request, "session");
    if (limited) return limited;
    const body = await request.json() as { ownerKey?: unknown };
    if (typeof body.ownerKey !== "string" || !body.ownerKey) return Response.json({ error: "ownerKey is required." }, { status: 400 });
    const desk = await getDesk(body.ownerKey);
    const sessionToken = await createOwnerSession(body.ownerKey);
    const response = ok({ authenticated: true, desk }, 200, request);
    response.headers.append("Set-Cookie", ownerCookie(sessionToken));
    return response;
  } catch (error) { return fail(error, request); }
}

/** Revoke only this browser session; copied cookies stop working immediately. */
export async function DELETE(request: Request) {
  try {
    if (!isSameOriginRequest(request)) return Response.json({ error: "A same-origin request is required." }, { status: 403 });
    const limited = await limit(request, "session");
    if (limited) return limited;
    const credential = ownerCredential(request);
    if (credential?.startsWith("rd_session_")) {
      try { await revokeOwnerSession(credential); }
      catch (error) { if (!(error instanceof DeskError) || error.status !== 401) throw error; }
    }
    const response = ok({ authenticated: false }, 200, request);
    response.headers.append("Set-Cookie", ownerCookie("", 0));
    return response;
  } catch (error) { return fail(error, request); }
}
