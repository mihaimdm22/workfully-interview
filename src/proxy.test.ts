import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";
import { CONVERSATION_COOKIE_NAME } from "@/lib/cookies";

/**
 * Tests for the cookie-minting proxy.
 *
 * The proxy is the only place new conversation cookies are set, so a typo
 * here breaks every first-time visitor. These tests run the function
 * directly rather than booting a Next server — fast, deterministic.
 */

function makeRequest(opts?: { cookie?: string }): NextRequest {
  const headers = new Headers();
  if (opts?.cookie) {
    headers.set("cookie", opts.cookie);
  }
  return new NextRequest(new URL("https://example.test/"), { headers });
}

describe("proxy (cookie minting)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("first visit (no cookie)", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "development");
    });

    it("sets a Set-Cookie header with the right name and attributes", () => {
      const res = proxy(makeRequest());
      const setCookie = res.headers.get("set-cookie");
      expect(setCookie).not.toBeNull();
      expect(setCookie).toContain(`${CONVERSATION_COOKIE_NAME}=`);
      expect(setCookie?.toLowerCase()).toContain("httponly");
      expect(setCookie?.toLowerCase()).toContain("samesite=lax");
      expect(setCookie).toContain("Path=/");
      // 7 days in seconds.
      expect(setCookie).toContain("Max-Age=604800");
    });

    it("does NOT include Secure in development", () => {
      const res = proxy(makeRequest());
      const setCookie = res.headers.get("set-cookie");
      expect(setCookie?.toLowerCase()).not.toContain("secure");
    });
  });

  describe("first visit in production", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "production");
    });

    it("includes Secure flag", () => {
      const res = proxy(makeRequest());
      const setCookie = res.headers.get("set-cookie");
      expect(setCookie?.toLowerCase()).toContain("secure");
    });
  });

  describe("repeat visit (cookie present)", () => {
    it("does not set a new cookie", () => {
      const res = proxy(
        makeRequest({ cookie: `${CONVERSATION_COOKIE_NAME}=existing-id` }),
      );
      const setCookie = res.headers.get("set-cookie");
      expect(setCookie).toBeNull();
    });
  });
});
