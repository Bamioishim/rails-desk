import { describe, expect, it } from "vitest";
import { OWNER_COOKIE, ownerCookie, ownerCredential } from "../server/session";

describe("owner session cookie", () => {
  it("prefers the HttpOnly cookie credential", () => {
    const request = new Request("https://rails-desk.test/api/v1/desk", {
      headers: { cookie: `${OWNER_COOKIE}=rd_owner_12345678_secretsecretsecret` },
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
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const value = ownerCookie("rd_owner_12345678_secretsecretsecret");
      expect(value).toContain("HttpOnly");
      expect(value).toContain("SameSite=Strict");
      expect(value).toContain("Secure");
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
