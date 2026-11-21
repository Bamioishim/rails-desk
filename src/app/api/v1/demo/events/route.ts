import { bearer, recordDemoEvent } from "@/lib/server/desk";
import { fail, json, limit, ok, options } from "@/lib/server/http";
export const OPTIONS = options;

/** Owner-only demo audit event. Demo activity shares the verified desk chain but is clearly labelled simulated. */
export async function POST(request: Request) {
  try {
    const limited = await limit(request, "key");
    if (limited) return limited;
    return ok(await recordDemoEvent(bearer(request), await json(request)), 201, request);
  } catch (e) {
    return fail(e, request);
  }
}
