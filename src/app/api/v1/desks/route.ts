import { createDesk } from "@/lib/server/desk";
import { fail, json, ok, options } from "@/lib/server/http";
export const OPTIONS = options;
/** Create a desk. Returns the owner key (keep it in the app) and an agent key (give it to your agent). */
export async function POST(request: Request) {
  try { const body = await json(request); return ok(await createDesk(typeof body?.name === "string" ? body.name : undefined), 201); } catch (e) { return fail(e); }
}
