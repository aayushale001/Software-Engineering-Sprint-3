import { describe, expect, it } from "vitest";

import { extractBearerToken, extractCookieToken } from "./jwt.js";

describe("JWT helpers", () => {
  it("extracts bearer token from authorization header", () => {
    expect(extractBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });

  it("returns null when authorization header is invalid", () => {
    expect(extractBearerToken("Token abc")).toBeNull();
    expect(extractBearerToken(undefined)).toBeNull();
  });

  it("extracts token from cookie header", () => {
    expect(extractCookieToken("foo=bar; access_token=token-123; x=y", "access_token")).toBe("token-123");
  });
});
