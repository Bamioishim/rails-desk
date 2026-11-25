export const OWNER_COOKIE = "rails_desk_owner";

export function ownerCredential(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  const value = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${OWNER_COOKIE}=`))?.slice(OWNER_COOKIE.length + 1);
  if (value) {
    try { return decodeURIComponent(value); } catch { return null; }
  }
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || null;
}

export function ownerCookie(credential: string, maxAge = 60 * 60 * 24 * 30): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${OWNER_COOKIE}=${encodeURIComponent(credential)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`;
}
