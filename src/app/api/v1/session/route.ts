import { getDesk } from "@/lib/server/desk";
import { OWNER_COOKIE, ownerCookie } from "@/lib/server/session";
import { fail, ok } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const cookie = request.headers.get("cookie") ?? "";
    const raw = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${OWNER_COOKIE}=`))?.slice(OWNER_COOKIE.length + 1);
    if (!raw) return ok({ authenticated: false }, 200, request);
    const ownerKey = decodeURIComponent(raw);
    return ok({ authenticated: true, desk: await getDesk(ownerKey) }, 200, request);
  } catch (error) { return fail(error, request); }
}

/** Exchange a legacy browser owner key for a server-only HttpOnly cookie. */
export async function POST(request: Request) {
  try {
    const body = await request.json() as { ownerKey?: unknown };
    if (typeof body.ownerKey !== "string" || !body.ownerKey) return Response.json({ error: "ownerKey is required." }, { status: 400 });
    const desk = await getDesk(body.ownerKey);
    const response = ok({ authenticated: true, desk }, 200, request);
    response.headers.append("Set-Cookie", ownerCookie(body.ownerKey));
    return response;
  } catch (error) { return fail(error, request); }
}

export async function DELETE(request: Request) {
  const response = ok({ authenticated: false }, 200, request);
  response.headers.append("Set-Cookie", ownerCookie("", 0));
  return response;
}
