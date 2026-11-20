import { DeskError } from "./desk";
export const noStore = { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS" };
export const ok = (data: unknown, status = 200) => Response.json(data, { status, headers: noStore });
export function fail(error: unknown) {
  if (error instanceof DeskError) return Response.json({ error: error.message }, { status: error.status, headers: noStore });
  if (error instanceof SyntaxError) return Response.json({ error: "Body must be JSON." }, { status: 400, headers: noStore });
  return Response.json({ error: error instanceof Error ? error.message : "Unexpected error." }, { status: 500, headers: noStore });
}
export const options = () => new Response(null, { status: 204, headers: noStore });
export async function json(request: Request) { const t = await request.text(); return t ? JSON.parse(t) : {}; }
