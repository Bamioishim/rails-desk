import { describe, expect, it, vi } from "vitest";
import { OWNER_COOKIE, ownerCookie, ownerCredential } from "../server/session";

describe("owner session cookie", () => {
  it("prefers the HttpOnly cookie credential", () => {
    const request = new Request("https://rails-desk.test/api/v1/desk", {
      headers: { cookie: `${OWNER_COOKIE}=rd_session_12345678_secretsecretsecret` },
    });
    expect(ownerCredential(request)).toBe("rd_owner_12345678_secretsecretsecret");
  });

  it("retains explicit bearer credentials for trusted server integrations", () => {
    const request = new Request("https://rails-desk.test/api/v1/desk", {
      headers: { authorization: "Bearer rd_owner_12345678_secretsecretsecret" },
    });
    expect(ownerCredential(request)).toBe("rd_owner_12345678_secretsecretsecret");
  });

  it("sets HttpOnly, SameSite=Strict and Secure in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const value = ownerCookie("rd_owner_12345678_secretsecretsecret");
      expect(value).toContain("HttpOnly");
      expect(value).toContain("SameSite=Strict");
      expect(value).toContain("Secure");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
