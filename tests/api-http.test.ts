import { afterEach, describe, expect, it, vi } from "vitest";

import { HttpError, assertSameOrigin, handleApiError } from "@/api/http";
import { apiClient } from "@/hooks/use-api";
import { ApiError } from "@/lib/api-error";

function request(headers: Record<string, string>) {
  return new Request("http://localhost:3000/api/production-tasks/document", { method: "POST", headers });
}

function rejection(headers: Record<string, string>) {
  try {
    assertSameOrigin(request(headers));
    return null;
  } catch (error) {
    return error;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("assertSameOrigin", () => {
  it("lets the app's own pages through, also behind a proxy that drops the port", () => {
    expect(rejection({ host: "localhost:3000", origin: "http://localhost:3000", "sec-fetch-site": "same-origin" })).toBeNull();
    expect(rejection({ host: "165-245-253-31.nip.io", origin: "https://165-245-253-31.nip.io" })).toBeNull();
    expect(rejection({ host: "app", "x-forwarded-host": "165.245.253.31", origin: "http://165.245.253.31" })).toBeNull();
    expect(rejection({ host: "localhost", origin: "http://localhost:8080" })).toBeNull();
  });

  it("lets a request without browser headers through — it is not an authentication", () => {
    expect(rejection({ host: "localhost:3000" })).toBeNull();
  });

  it("refuses another site", () => {
    const attempts: Record<string, string>[] = [
      { host: "165-245-253-31.nip.io", origin: "https://evil.example" },
      { host: "165-245-253-31.nip.io", origin: "null" },
      { host: "165-245-253-31.nip.io", "sec-fetch-site": "cross-site" },
      { host: "165-245-253-31.nip.io", "sec-fetch-site": "same-site", origin: "https://165-245-253-31.nip.io" }
    ];
    for (const headers of attempts) {
      const error = rejection(headers);
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).status).toBe(403);
    }
  });
});

describe("handleApiError", () => {
  it("sends an HttpError's extra fields next to its message", async () => {
    const response = handleApiError(
      new HttpError(502, "Рубікон недоступний", { code: "unreachable", transfer_ids: ["x"], message: "ignored" })
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ code: "unreachable", transfer_ids: ["x"], message: "Рубікон недоступний" });
  });

  it("keeps a plain HttpError body as before", async () => {
    expect(await handleApiError(new HttpError(409, "Конфлікт")).json()).toEqual({ message: "Конфлікт" });
  });
});

describe("apiClient errors", () => {
  it("carries the status and the whole JSON body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ message: "Рубікон недоступний", code: "unreachable" }, { status: 502 }))
    );
    const error = await apiClient("/api/x").catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ message: "Рубікон недоступний", status: 502, body: { code: "unreachable" } });
  });

  it("falls back to a generic message for a non-JSON error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Bad Gateway", { status: 502 })));
    const error = await apiClient("/api/x").catch((reason: unknown) => reason);
    expect(error).toMatchObject({ message: "Request failed", status: 502, body: {} });
  });
});
