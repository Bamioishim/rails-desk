import { createOwnerSession, getDesk, revokeOwnerSession } from "@/lib/server/desk";
import { ownerCredential, ownerCookie } from "@/lib/server/session";
import { fail, isSameOriginRequest, limit, ok } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const credential = ownerCredential(request);
    if (!credential) return ok({ authenticated: false }, 200, request);
    return ok({ authenticated: true, desk: await getDesk(credential) }, 200, request);
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
    if (credential?.startsWith("rd_session_")) await revokeOwnerSession(credential);
    const response = ok({ authenticated: false }, 200, request);
    response.headers.append("Set-Cookie", ownerCookie("", 0));
    return response;
  } catch (error) { return fail(error, request); }
}
