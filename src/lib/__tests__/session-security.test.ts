import { beforeEach, describe, expect, it } from "vitest";
import { isSameOriginRequest, limit } from "../server/http";
import { resetMemoryLimiter } from "../server/rate-limit";

beforeEach(() => {
  delete process.env.RAILS_DESK_RATE_LIMIT;
  resetMemoryLimiter();
});

describe("browser session request protection", () => {
  it("accepts only an explicit matching Origin", () => {
    expect(isSameOriginRequest(new Request("https://rails-desk.test/api/v1/session", {
      method: "POST", headers: { origin: "https://rails-desk.test" },
    }))).toBe(true);
    expect(isSameOriginRequest(new Request("https://rails-desk.test/api/v1/session", {
      method: "POST", headers: { origin: "https://attacker.test" },
    }))).toBe(false);
    expect(isSameOriginRequest(new Request("https://rails-desk.test/api/v1/session", {
      method: "POST",
    }))).toBe(false);
    expect(isSameOriginRequest(new Request("https://rails-desk.test/api/v1/session", {
      method: "POST", headers: { origin: "null" },
    }))).toBe(false);
  });

  it("applies a dedicated per-IP limit to session mutations", async () => {
    const request = new Request("https://rails-desk.test/api/v1/session", {
      method: "POST", headers: { "x-forwarded-for": "203.0.113.8" },
    });
    for (let i = 0; i < 10; i++) expect(await limit(request, "session")).toBeNull();
    const blocked = await limit(request, "session");
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get("Retry-After")).toBeTruthy();
  });
});
