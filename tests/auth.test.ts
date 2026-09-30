import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieJar = vi.hoisted(() => {
  // lib/env validates these at import time; only AUTH_SECRET is used here.
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
  vi.stubEnv("ADMIN_EMAIL", "admin@example.com");
  vi.stubEnv("ADMIN_PASSWORD", "test-password");
  vi.stubEnv("AUTH_SECRET", "test-secret-that-is-long-enough-1234");
  return new Map<string, string>();
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    }
  })
}));

import { requireAdmin } from "@/api/auth";
import { AUTH_COOKIE_NAME, createSessionToken } from "@/services/auth/session";

describe("requireAdmin", () => {
  beforeEach(() => {
    cookieJar.clear();
  });

  it("rejects a request without the session cookie", async () => {
    await expect(requireAdmin()).rejects.toThrow("Unauthorized");
  });

  it("rejects random and forged tokens", async () => {
    const valid = await createSessionToken("admin@example.com");
    const separator = valid.lastIndexOf(".");
    const signature = valid.slice(separator + 1);
    const forged = [
      "anything",
      "admin@example.com:1700000000000.deadbeef",
      `intruder@example.com:${Date.now()}.${signature}`,
      `${valid.slice(0, -1)}${valid.endsWith("0") ? "1" : "0"}`
    ];

    for (const token of forged) {
      cookieJar.set(AUTH_COOKIE_NAME, token);
      await expect(requireAdmin(), token).rejects.toThrow("Unauthorized");
    }
  });

  it("accepts a token signed with the app secret", async () => {
    cookieJar.set(AUTH_COOKIE_NAME, await createSessionToken("admin@example.com"));
    await expect(requireAdmin()).resolves.toBeUndefined();
  });
});
