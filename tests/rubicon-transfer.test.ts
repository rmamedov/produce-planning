import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  RUBICON_DEFAULT_SCOPE,
  RubiconError,
  createRubiconClient,
  resolveRubiconMode,
  type RubiconConfig
} from "@/services/rubicon/rubicon-client";
import {
  buildTransferGroups,
  buildTransferItems,
  formatTransferDate,
  resolveSourceFilial,
  resumedOrderIds,
  transferOrderId,
  uuidV5,
  type TransferGroup,
  type TransferPayload,
  type TransferTask
} from "@/services/rubicon/rubicon-payload";
import {
  DOCUMENT_CONFLICT_MESSAGE,
  documentTransferGroups,
  rubiconTransferService,
  type DocumentSteps,
  type TransferResult
} from "@/services/rubicon/rubicon-transfer.service";

const CONFIG: RubiconConfig = {
  apiUrl: "https://rubicon.test/v1/ecom/dams/production-transfers",
  tokenUrl: "https://identity.test/connect/token",
  clientId: "test-client",
  clientSecret: "test-secret",
  scope: RUBICON_DEFAULT_SCOPE,
  timeoutMs: 15000
};

const LIVE_ENV = {
  RUBICON_API_URL: CONFIG.apiUrl,
  RUBICON_TOKEN_URL: CONFIG.tokenUrl,
  RUBICON_CLIENT_ID: CONFIG.clientId,
  RUBICON_CLIENT_SECRET: CONFIG.clientSecret
};

const PAYLOAD: TransferPayload = {
  sourceFilial: 2041,
  destinationFilial: 2042,
  productionForecastId: "forecast-2042-2026-10-01",
  orderId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  orderNumber: "0",
  date: "2026-10-01T09:30:00Z",
  items: [{ sku: 777, quantity: 5 }]
};

const UUID_V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type Reply = { status: number; body?: unknown } | Error;

/** Global fetch stub: identity and API replies are scripted separately; unscripted calls succeed. */
function stubFetch(replies: { token?: Reply[]; api?: Reply[] } = {}) {
  const token = [...(replies.token ?? [])];
  const api = [...(replies.api ?? [])];
  const tokenCalls: RequestInit[] = [];
  const apiCalls: RequestInit[] = [];
  let issued = 0;

  const fetchMock = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const isToken = String(input) === CONFIG.tokenUrl;
    (isToken ? tokenCalls : apiCalls).push(init);
    const reply =
      (isToken ? token : api).shift() ??
      (isToken
        ? { status: 200, body: { access_token: `jwt-${++issued}`, token_type: "Bearer", expires_in: 3600 } }
        : { status: 200, body: { accepted: true } });
    if (reply instanceof Error) throw reply;
    const body = typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body ?? {});
    return new Response(body, { status: reply.status });
  });
  vi.stubGlobal("fetch", fetchMock);

  return { fetchMock, tokenCalls, apiCalls };
}

function header(init: RequestInit, name: string) {
  return new Headers(init.headers).get(name);
}

function setup(replies?: { token?: Reply[]; api?: Reply[] }) {
  const clock = { now: 0 };
  const sleep = vi.fn(async () => {});
  const client = createRubiconClient({ now: () => clock.now, sleep });
  return { client, clock, sleep, ...stubFetch(replies) };
}

async function rubiconFailure(promise: Promise<unknown>): Promise<RubiconError> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason
  );
  expect(error).toBeInstanceOf(RubiconError);
  return error as RubiconError;
}

const task = (overrides: Partial<TransferTask> & Pick<TransferTask, "id">): TransferTask => ({
  filialId: 2042,
  lagerId: 777,
  historyDate: new Date("2026-10-01T00:00:00Z"),
  quantity: 5,
  producedQty: null,
  transferId: null,
  ...overrides
});

let logs: unknown[][];

beforeEach(() => {
  logs = [];
  const capture = (...args: unknown[]) => {
    logs.push(args);
  };
  vi.spyOn(console, "info").mockImplementation(capture);
  vi.spyOn(console, "error").mockImplementation(capture);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("resolveRubiconMode", () => {
  it("is stub without URL or credentials", () => {
    expect(resolveRubiconMode({})).toEqual({ mode: "stub" });
    expect(resolveRubiconMode({ RUBICON_API_URL: CONFIG.apiUrl })).toEqual({ mode: "stub" });
    expect(resolveRubiconMode({ ...LIVE_ENV, RUBICON_CLIENT_SECRET: "  " })).toEqual({ mode: "stub" });
  });

  it("is live with the full config, defaulting scope and timeout", () => {
    expect(resolveRubiconMode(LIVE_ENV)).toEqual({ mode: "live", config: CONFIG });
  });

  it("honours an explicit scope and timeout, ignoring a broken timeout", () => {
    const resolved = resolveRubiconMode({ ...LIVE_ENV, RUBICON_SCOPE: "custom:scope", RUBICON_TIMEOUT_MS: "5000" });
    expect(resolved).toEqual({ mode: "live", config: { ...CONFIG, scope: "custom:scope", timeoutMs: 5000 } });
    const broken = resolveRubiconMode({ ...LIVE_ENV, RUBICON_TIMEOUT_MS: "soon" });
    expect(broken.mode === "live" && broken.config.timeoutMs).toBe(15000);
  });

  it("RUBICON_MODE=stub wins over a complete config", () => {
    expect(resolveRubiconMode({ ...LIVE_ENV, RUBICON_MODE: "stub" })).toEqual({ mode: "stub" });
  });

  it("RUBICON_MODE=live without the full config names what is missing, not the values", () => {
    expect(resolveRubiconMode({ RUBICON_MODE: "live", RUBICON_API_URL: CONFIG.apiUrl })).toEqual({
      mode: "misconfigured",
      missing: ["RUBICON_TOKEN_URL", "RUBICON_CLIENT_ID", "RUBICON_CLIENT_SECRET"]
    });
  });

  it("an unknown RUBICON_MODE is refused, never read as unset (which would go live)", () => {
    for (const value of ["off", "disabled", "false", "test", "none", "0"]) {
      expect(resolveRubiconMode({ ...LIVE_ENV, RUBICON_MODE: value })).toEqual({
        mode: "misconfigured",
        missing: ["RUBICON_MODE (stub|live)"]
      });
    }
  });

  it("an empty RUBICON_MODE counts as unset", () => {
    expect(resolveRubiconMode({ ...LIVE_ENV, RUBICON_MODE: " " })).toEqual({ mode: "live", config: CONFIG });
    expect(resolveRubiconMode({ RUBICON_MODE: "" })).toEqual({ mode: "stub" });
  });

  it("accepts the mode in any case", () => {
    expect(resolveRubiconMode({ ...LIVE_ENV, RUBICON_MODE: " Stub " })).toEqual({ mode: "stub" });
    expect(resolveRubiconMode({ ...LIVE_ENV, RUBICON_MODE: "LIVE" })).toEqual({ mode: "live", config: CONFIG });
  });
});

describe("Рубікон token", () => {
  it("requests a client_credentials token with a form body and an explicit User-Agent", async () => {
    const { client, fetchMock, tokenCalls } = setup();
    await client.createTransfer(CONFIG, PAYLOAD);

    expect(fetchMock.mock.calls[0][0]).toBe(CONFIG.tokenUrl);
    expect(tokenCalls).toHaveLength(1);
    const [call] = tokenCalls;
    expect(call.method).toBe("POST");
    expect(header(call, "Content-Type")).toBe("application/x-www-form-urlencoded");
    expect(header(call, "User-Agent")).toBe("produce-planning/1.0");
    expect(Object.fromEntries(new URLSearchParams(String(call.body)))).toEqual({
      grant_type: "client_credentials",
      client_id: "test-client",
      client_secret: "test-secret",
      scope: "ecom--dams--transfer-orchestrator-service:transfer--create"
    });
  });

  it("reuses the token until expires_in - 60 s", async () => {
    const { client, clock, tokenCalls, apiCalls } = setup();
    await client.createTransfer(CONFIG, PAYLOAD);
    clock.now = (3600 - 61) * 1000;
    await client.createTransfer(CONFIG, PAYLOAD);
    expect(tokenCalls).toHaveLength(1);

    clock.now = (3600 - 60) * 1000;
    await client.createTransfer(CONFIG, PAYLOAD);
    expect(tokenCalls).toHaveLength(2);
    expect(apiCalls.map((call) => header(call, "Authorization"))).toEqual([
      "Bearer jwt-1",
      "Bearer jwt-1",
      "Bearer jwt-2"
    ]);
  });

  it("concurrent callers share one in-flight token request", async () => {
    const { client, tokenCalls, apiCalls } = setup();
    await Promise.all([
      client.createTransfer(CONFIG, PAYLOAD),
      client.createTransfer(CONFIG, PAYLOAD),
      client.getToken(CONFIG)
    ]);
    expect(tokenCalls).toHaveLength(1);
    expect(apiCalls).toHaveLength(2);
  });

  it("reports an identity rejection with its OAuth error and sends nothing", async () => {
    const { client, apiCalls, tokenCalls, sleep } = setup({
      token: [{ status: 401, body: { error: "invalid_client" } }]
    });
    const error = await rubiconFailure(client.createTransfer(CONFIG, PAYLOAD));
    expect(error.kind).toBe("auth");
    expect(error.message).toBe("Не вдалося авторизуватися в Рубіконі (identity: HTTP 401 invalid_client)");
    expect(tokenCalls).toHaveLength(1);
    expect(apiCalls).toHaveLength(0);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("shows a non-JSON identity body as text (Cloudflare block)", async () => {
    const { client } = setup({ token: [{ status: 403, body: "error code: 1010" }] });
    const error = await rubiconFailure(client.createTransfer(CONFIG, PAYLOAD));
    expect(error.message).toBe("Не вдалося авторизуватися в Рубіконі (identity: HTTP 403 error code: 1010)");
  });

  it("treats a reply without access_token as an auth failure", async () => {
    const { client } = setup({ token: [{ status: 200, body: { token_type: "Bearer" } }] });
    const error = await rubiconFailure(client.createTransfer(CONFIG, PAYLOAD));
    expect(error.kind).toBe("auth");
  });

  it("does not cache a failed token request", async () => {
    const { client, tokenCalls } = setup({ token: [{ status: 401, body: { error: "invalid_client" } }] });
    await rubiconFailure(client.createTransfer(CONFIG, PAYLOAD));
    await client.createTransfer(CONFIG, PAYLOAD);
    expect(tokenCalls).toHaveLength(2);
  });
});

describe("Рубікон transfer request", () => {
  it("POSTs the payload as JSON with the Bearer token and the User-Agent", async () => {
    const { client, fetchMock, apiCalls } = setup();
    expect(await client.createTransfer(CONFIG, PAYLOAD)).toEqual({ status: 200, body: '{"accepted":true}' });

    expect(fetchMock.mock.calls[1][0]).toBe(CONFIG.apiUrl);
    const [call] = apiCalls;
    expect(call.method).toBe("POST");
    expect(header(call, "Authorization")).toBe("Bearer jwt-1");
    expect(header(call, "Content-Type")).toBe("application/json");
    expect(header(call, "User-Agent")).toBe("produce-planning/1.0");
    expect(JSON.parse(String(call.body))).toEqual(PAYLOAD);
  });

  it("accepts any 2xx", async () => {
    const { client } = setup({ api: [{ status: 202, body: "" }] });
    expect((await client.createTransfer(CONFIG, PAYLOAD)).status).toBe(202);
  });

  it("on 401 refreshes the token once and retries once", async () => {
    const { client, tokenCalls, apiCalls, sleep } = setup({ api: [{ status: 401 }] });
    await client.createTransfer(CONFIG, PAYLOAD);
    expect(tokenCalls).toHaveLength(2);
    expect(apiCalls.map((call) => header(call, "Authorization"))).toEqual(["Bearer jwt-1", "Bearer jwt-2"]);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("a second 401 is final", async () => {
    const { client, tokenCalls, apiCalls } = setup({
      api: [{ status: 401 }, { status: 401, body: "token rejected" }]
    });
    const error = await rubiconFailure(client.createTransfer(CONFIG, PAYLOAD));
    expect(error.message).toBe("Рубікон відхилив трансфер: HTTP 401 — token rejected");
    expect(tokenCalls).toHaveLength(2);
    expect(apiCalls).toHaveLength(2);
  });

  it("retries a 5xx once after 1 s with the same orderId", async () => {
    const { client, apiCalls, sleep } = setup({ api: [{ status: 503, body: "upstream down" }] });
    await client.createTransfer(CONFIG, PAYLOAD);
    expect(apiCalls).toHaveLength(2);
    expect(apiCalls[1].body).toBe(apiCalls[0].body);
    expect(JSON.parse(String(apiCalls[1].body)).orderId).toBe(PAYLOAD.orderId);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it("gives up after the second 5xx", async () => {
    const { client, apiCalls } = setup({
      api: [
        { status: 503, body: "upstream down" },
        { status: 502, body: "  bad\n gateway  " }
      ]
    });
    const error = await rubiconFailure(client.createTransfer(CONFIG, PAYLOAD));
    expect(error.kind).toBe("rejected");
    expect(error.message).toBe("Рубікон відхилив трансфер: HTTP 502 — bad gateway");
    expect(apiCalls).toHaveLength(2);
  });

  it("retries a network error once", async () => {
    const { client, apiCalls } = setup({ api: [new TypeError("fetch failed")] });
    await client.createTransfer(CONFIG, PAYLOAD);
    expect(apiCalls).toHaveLength(2);
  });

  it("reports an unreachable host after the retry", async () => {
    const timeout = new DOMException("The operation was aborted due to timeout", "TimeoutError");
    const { client, apiCalls } = setup({ api: [new TypeError("fetch failed"), timeout] });
    const error = await rubiconFailure(client.createTransfer(CONFIG, PAYLOAD));
    expect(error.kind).toBe("unreachable");
    expect(error.message).toBe(
      "Рубікон недоступний: rubicon.test не відповідає. Задачі лишились у «Виконаних» — спробуйте пізніше."
    );
    expect(apiCalls).toHaveLength(2);
  });

  it("an unreachable identity names the identity host", async () => {
    const { client, apiCalls } = setup({ token: [new TypeError("fetch failed"), new TypeError("fetch failed")] });
    const error = await rubiconFailure(client.createTransfer(CONFIG, PAYLOAD));
    expect(error.message).toContain("identity.test не відповідає");
    expect(apiCalls).toHaveLength(0);
  });

  it("does not retry a 4xx and quotes a short body", async () => {
    const { client, apiCalls, sleep } = setup({ api: [{ status: 400, body: "x".repeat(500) }] });
    const error = await rubiconFailure(client.createTransfer(CONFIG, PAYLOAD));
    expect(error.message).toBe(`Рубікон відхилив трансфер: HTTP 400 — ${"x".repeat(200)}…`);
    expect(apiCalls).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("flags an unanswered POST as maybe created, a definite answer as not", async () => {
    const timeout = () => new DOMException("The operation was aborted due to timeout", "TimeoutError");
    const cases: { replies: { token?: Reply[]; api?: Reply[] }; maybeCreated: boolean }[] = [
      { replies: { api: [timeout(), timeout()] }, maybeCreated: true },
      { replies: { api: [{ status: 503 }, { status: 502 }] }, maybeCreated: true },
      // The retry's 4xx does not prove the first, unanswered POST created nothing.
      { replies: { api: [timeout(), { status: 400 }] }, maybeCreated: true },
      { replies: { api: [{ status: 400 }] }, maybeCreated: false },
      { replies: { api: [{ status: 401 }, { status: 401 }] }, maybeCreated: false },
      { replies: { token: [{ status: 401, body: { error: "invalid_client" } }] }, maybeCreated: false },
      { replies: { token: [new TypeError("fetch failed"), new TypeError("fetch failed")] }, maybeCreated: false }
    ];
    for (const { replies, maybeCreated } of cases) {
      const { client } = setup(replies);
      const error = await rubiconFailure(client.createTransfer(CONFIG, PAYLOAD));
      expect(error.maybeCreated).toBe(maybeCreated);
    }
  });

  it("never logs the client secret or the token", async () => {
    const { client } = setup({ api: [{ status: 401 }, { status: 500 }, { status: 500 }] });
    await rubiconFailure(client.createTransfer(CONFIG, PAYLOAD));
    const logged = JSON.stringify(logs);
    expect(logged).toContain(PAYLOAD.orderId);
    expect(logged).not.toContain("test-secret");
    expect(logged).not.toContain("jwt-");
  });
});

describe("transfer payload", () => {
  it("formats the date as ISO UTC without milliseconds", () => {
    expect(formatTransferDate(new Date("2026-10-01T09:30:00.123Z"))).toBe("2026-10-01T09:30:00Z");
  });

  it("sums per SKU, prefers the produced quantity, rounds to 3 decimals and drops empty lines", () => {
    expect(
      buildTransferItems([
        task({ id: "a", lagerId: 778, producedQty: 0.1 }),
        task({ id: "b", lagerId: 778, producedQty: 0.2 }),
        task({ id: "c", lagerId: 777, quantity: 1.23456 }),
        task({ id: "d", lagerId: 779, quantity: 4, producedQty: 0 }),
        task({ id: "e", lagerId: 780, quantity: 0 })
      ])
    ).toEqual([
      { sku: 777, quantity: 1.235 },
      { sku: 778, quantity: 0.3 }
    ]);
  });

  it("builds the documented request body", () => {
    const now = new Date("2026-10-01T09:30:00.456Z");
    const [group] = buildTransferGroups(
      [task({ id: "t2", producedQty: 2.5 }), task({ id: "t1", producedQty: 2.5 }), task({ id: "t3", lagerId: 778 })],
      { presentation: { filial_ids: [2041, 2042], production_filial_id: 2041 }, now }
    );
    expect(group).toEqual({
      taskIds: ["t2", "t1", "t3"],
      resumed: false,
      payload: {
        sourceFilial: 2041,
        destinationFilial: 2042,
        productionForecastId: "forecast-2042-2026-10-01",
        orderId: transferOrderId(["t1", "t2", "t3"]),
        orderNumber: "0",
        date: "2026-10-01T09:30:00Z",
        items: [
          { sku: 777, quantity: 5 },
          { sku: 778, quantity: 5 }
        ]
      }
    });
  });

  it("makes one transfer per production date, each with its own orderId", () => {
    const groups = buildTransferGroups(
      [
        task({ id: "late", historyDate: new Date("2026-10-02T00:00:00Z") }),
        task({ id: "early-1" }),
        task({ id: "early-2", lagerId: 778 })
      ],
      { presentation: null, now: new Date("2026-10-02T08:00:00Z") }
    );
    expect(groups.map((group) => group.taskIds)).toEqual([["early-1", "early-2"], ["late"]]);
    expect(groups.map((group) => group.payload.productionForecastId)).toEqual([
      "forecast-2042-2026-10-01",
      "forecast-2042-2026-10-02"
    ]);
    expect(groups[0].payload.orderId).toBe(transferOrderId(["early-1", "early-2"]));
    expect(groups[0].payload.orderId).not.toBe(groups[1].payload.orderId);
  });

  it("resends tasks holding an unanswered orderId under it, apart from fresh tasks of the same date", () => {
    const pending = transferOrderId(["a", "b"]);
    const groups = buildTransferGroups(
      [task({ id: "c" }), task({ id: "a", transferId: pending }), task({ id: "b", transferId: pending, lagerId: 778 })],
      { presentation: null, now: new Date("2026-10-01T10:00:00Z") }
    );
    expect(groups.map(({ taskIds, resumed, payload }) => ({ taskIds, resumed, orderId: payload.orderId }))).toEqual([
      { taskIds: ["a", "b"], resumed: true, orderId: pending },
      { taskIds: ["c"], resumed: false, orderId: transferOrderId(["c"]) }
    ]);
    expect(groups[0].payload.items).toEqual([
      { sku: 777, quantity: 5 },
      { sku: 778, quantity: 5 }
    ]);
  });

  it("keeps the stored orderId even when the resent group is smaller than the first attempt", () => {
    const pending = transferOrderId(["a", "b"]);
    const [group] = buildTransferGroups([task({ id: "a", transferId: pending })], { presentation: null, now: new Date() });
    expect(group.payload.orderId).toBe(pending);
    expect(group.resumed).toBe(true);
  });

  it("lists the distinct pending order ids", () => {
    expect(resumedOrderIds([{ transferId: "x" }, { transferId: null }, { transferId: "x" }, { transferId: "y" }])).toEqual([
      "x",
      "y"
    ]);
  });

  it("skips a date whose quantities are all zero", () => {
    const groups = buildTransferGroups(
      [task({ id: "zero", quantity: 0, historyDate: new Date("2026-09-30T00:00:00Z") }), task({ id: "real" })],
      { presentation: null, now: new Date() }
    );
    expect(groups.map((group) => group.taskIds)).toEqual([["real"]]);
  });
});

describe("transferOrderId", () => {
  it("is a standard UUID v5", () => {
    expect(uuidV5("www.example.com", "6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe(
      "2ed6657d-e927-568b-95e1-2665a8aea6a2"
    );
    expect(transferOrderId(["a"])).toMatch(UUID_V5);
  });

  it("is the same for the same tasks in any order", () => {
    expect(transferOrderId(["b", "a", "c"])).toBe(transferOrderId(["c", "b", "a"]));
    expect(transferOrderId(["a", "a", "b"])).toBe(transferOrderId(["b", "a"]));
  });

  it("differs for a different selection", () => {
    expect(transferOrderId(["a", "b"])).not.toBe(transferOrderId(["a"]));
    expect(transferOrderId(["a", "b"])).not.toBe(transferOrderId(["a", "c"]));
    expect(transferOrderId(["ab"])).not.toBe(transferOrderId(["a", "b"]));
  });
});

describe("resolveSourceFilial", () => {
  const kitchen = { filial_ids: [2041, 2042, 3361], production_filial_id: 2041 };

  it("ships from the presentation's production filial", () => {
    expect(resolveSourceFilial(2042, kitchen)).toBe(2041);
    expect(resolveSourceFilial(2041, kitchen)).toBe(2041);
  });

  it("falls back to the ordering filial without a producer, presentation or membership", () => {
    expect(resolveSourceFilial(2042, { ...kitchen, production_filial_id: null })).toBe(2042);
    expect(resolveSourceFilial(2042, null)).toBe(2042);
    expect(resolveSourceFilial(9999, kitchen)).toBe(9999);
  });
});

describe("documentTransferGroups", () => {
  const groups: TransferGroup[] = ["11111111", "22222222", "33333333"].map((prefix, index) => ({
    taskIds: index === 0 ? ["a", "b"] : [`t${index}`],
    resumed: false,
    payload: { ...PAYLOAD, orderId: `${prefix}-0000-5000-8000-000000000000` }
  }));

  function steps(overrides: Partial<DocumentSteps> = {}) {
    const calls: string[] = [];
    const base: DocumentSteps = {
      claim: async (group) => {
        calls.push(`claim ${group.payload.orderId.slice(0, 1)}`);
        return true;
      },
      send: async (payload) => {
        calls.push(`send ${payload.orderId.slice(0, 1)}`);
        return { orderId: payload.orderId, delivered: true };
      },
      markDocumented: async (group) => {
        calls.push(`mark ${group.payload.orderId.slice(0, 1)}`);
        return group.taskIds.length;
      },
      release: async (group) => {
        calls.push(`release ${group.payload.orderId.slice(0, 1)}`);
      }
    };
    return { calls, steps: { ...base, ...overrides } };
  }

  const failing = (error: RubiconError) => async (payload: TransferPayload): Promise<TransferResult> => {
    if (payload.orderId.startsWith("2")) throw error;
    return { orderId: payload.orderId, delivered: true };
  };

  it("claims, sends and marks every group in order", async () => {
    const { calls, steps: deps } = steps();
    const outcome = await documentTransferGroups(groups, deps);
    expect(calls).toEqual(["claim 1", "send 1", "mark 1", "claim 2", "send 2", "mark 2", "claim 3", "send 3", "mark 3"]);
    expect(outcome).toEqual({
      transferIds: groups.map((group) => group.payload.orderId),
      documentedTaskIds: ["a", "b", "t1", "t2"],
      documented: 4,
      delivered: true,
      error: null
    });
  });

  it("stops at a definite Рубікон rejection, frees that group and keeps earlier groups documented", async () => {
    const failure = new RubiconError("rejected", "Рубікон відхилив трансфер: HTTP 400 — bad sku");
    const { calls, steps: deps } = steps({ send: failing(failure) });
    const outcome = await documentTransferGroups(groups, deps);

    expect(calls).toEqual(["claim 1", "mark 1", "claim 2", "release 2"]);
    expect(outcome).toEqual({
      transferIds: [groups[0].payload.orderId],
      documentedTaskIds: ["a", "b"],
      documented: 2,
      delivered: true,
      error: { code: "rejected", message: failure.message }
    });
  });

  it("keeps the claim when the transfer may exist (timeout, network error, 5xx)", async () => {
    const failure = new RubiconError("unreachable", "Рубікон недоступний", true);
    failure.maybeCreated = true;
    const { calls, steps: deps } = steps({ send: failing(failure) });
    const outcome = await documentTransferGroups(groups, deps);
    expect(calls).toEqual(["claim 1", "mark 1", "claim 2"]);
    expect(outcome.error).toEqual({ code: "unreachable", message: "Рубікон недоступний" });
  });

  it("does not send a group another request holds", async () => {
    const send = vi.fn(async (payload: TransferPayload) => ({ orderId: payload.orderId, delivered: true }));
    const { calls, steps: deps } = steps({ claim: async (group) => !group.payload.orderId.startsWith("2"), send });
    const outcome = await documentTransferGroups(groups, deps);
    expect(send).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["mark 1"]);
    expect(outcome.error).toEqual({ code: "conflict", message: DOCUMENT_CONFLICT_MESSAGE });
    expect(outcome.transferIds).toEqual([groups[0].payload.orderId]);
  });

  it("resends a resumed group without claiming it again", async () => {
    const { calls, steps: deps } = steps();
    await documentTransferGroups([{ ...groups[0], resumed: true }], deps);
    expect(calls).toEqual(["send 1", "mark 1"]);
  });

  it("counts only the tasks that were still undocumented", async () => {
    const { steps: deps } = steps({ markDocumented: async () => 0 });
    const outcome = await documentTransferGroups(groups.slice(0, 1), deps);
    expect(outcome.documented).toBe(0);
    expect(outcome.transferIds).toEqual([groups[0].payload.orderId]);
  });

  it("lets non-Рубікон errors propagate and keeps the claim", async () => {
    const release = vi.fn(async () => {});
    const { steps: deps } = steps({
      send: async () => {
        throw new Error("boom");
      },
      release
    });
    await expect(documentTransferGroups(groups, deps)).rejects.toThrow("boom");
    expect(release).not.toHaveBeenCalled();
  });

  it("reports stub results as not delivered", async () => {
    const { steps: deps } = steps({ send: async (payload) => ({ orderId: payload.orderId, delivered: false }) });
    const outcome = await documentTransferGroups(groups.slice(0, 1), deps);
    expect(outcome.delivered).toBe(false);
  });
});

describe("document flow against stored tasks", () => {
  type StoredTask = TransferTask & { status: "NEW" | "DONE"; documentedAt: Date | null };
  const NOW = new Date("2026-10-01T10:00:00Z");

  /** Mirrors the route's Prisma reads and conditional writes on an in-memory table. */
  function memoryDb(tasks: StoredTask[]) {
    const rows = new Map(tasks.map((row) => [row.id, { ...row }]));
    const undocumented = (row: StoredTask) => row.status === "DONE" && row.documentedAt === null;
    const row = (id: string) => rows.get(id)!;

    const release = async (group: TransferGroup) => {
      for (const id of group.taskIds) {
        if (row(id).transferId === group.payload.orderId && !row(id).documentedAt) row(id).transferId = null;
      }
    };
    const steps = (send: DocumentSteps["send"]): DocumentSteps => ({
      claim: async (group) => {
        const free = group.taskIds.filter((id) => undocumented(row(id)) && row(id).transferId === null);
        for (const id of free) row(id).transferId = group.payload.orderId;
        if (free.length === group.taskIds.length) return true;
        if (free.length) await release(group);
        return false;
      },
      send,
      markDocumented: async (group) => {
        const open = group.taskIds.filter((id) => undocumented(row(id)));
        for (const id of open) Object.assign(row(id), { documentedAt: NOW, transferId: group.payload.orderId });
        return open.length;
      },
      release
    });

    return {
      row,
      steps,
      /** The route: the selection, plus every task sharing its pending orderIds. */
      groups(ids: string[]) {
        const selected = ids.map(row).filter(undocumented);
        const resumed = resumedOrderIds(selected);
        const siblings = [...rows.values()].filter(
          (task) => undocumented(task) && task.transferId && resumed.includes(task.transferId) && !ids.includes(task.id)
        );
        return buildTransferGroups([...selected, ...siblings], { presentation: null, now: NOW });
      },
      run(ids: string[], send: DocumentSteps["send"]) {
        return documentTransferGroups(this.groups(ids), steps(send));
      }
    };
  }

  const stored = (id: string, status: "NEW" | "DONE" = "DONE"): StoredTask => ({
    ...task({ id }),
    status,
    documentedAt: null
  });

  /** Рубікон as the spec describes it: a repeated orderId is skipped, not created again. */
  function rubicon() {
    const created = new Map<string, TransferPayload>();
    const accept = async (payload: TransferPayload): Promise<TransferResult> => {
      if (!created.has(payload.orderId)) created.set(payload.orderId, payload);
      return { orderId: payload.orderId, delivered: true };
    };
    return { created, accept };
  }

  function unanswered(accept: (payload: TransferPayload) => Promise<TransferResult>) {
    return async (payload: TransferPayload): Promise<TransferResult> => {
      await accept(payload); // Рубікон created it…
      const error = new RubiconError("unreachable", "Рубікон недоступний", true);
      error.maybeCreated = true; // …but the answer never came back.
      throw error;
    };
  }

  it("a retry after an unanswered call reuses the orderId although the selection grew", async () => {
    const db = memoryDb([stored("A"), stored("B"), stored("C", "NEW")]);
    const { created, accept } = rubicon();

    const first = await db.run(["A", "B"], unanswered(accept));
    expect(first.error?.code).toBe("unreachable");
    const x = transferOrderId(["A", "B"]);
    expect([db.row("A").transferId, db.row("B").transferId]).toEqual([x, x]);
    expect(db.row("A").documentedAt).toBeNull();

    db.row("C").status = "DONE"; // completed meanwhile — arrives checked
    const second = await db.run(["A", "B", "C"], accept);

    expect(second.error).toBeNull();
    expect(second.transferIds).toEqual([x, transferOrderId(["C"])]);
    // Рубікон holds X (A+B) and a transfer of C alone — not a second one with A+B+C.
    expect([...created.keys()].sort()).toEqual([x, transferOrderId(["C"])].sort());
    expect([db.row("A").transferId, db.row("B").transferId]).toEqual([x, x]);
    expect(db.row("C").documentedAt).toEqual(NOW);
  });

  it("a deselected task of an unanswered transfer is resent with it", async () => {
    const db = memoryDb([stored("A"), stored("B")]);
    const { created, accept } = rubicon();
    await db.run(["A", "B"], unanswered(accept));

    const retry = await db.run(["A"], accept);
    expect(retry.transferIds).toEqual([transferOrderId(["A", "B"])]);
    expect(retry.documentedTaskIds).toEqual(["A", "B"]);
    expect(created.size).toBe(1);
  });

  it("a definite rejection frees the tasks, so a changed selection gets a new orderId", async () => {
    const db = memoryDb([stored("A"), stored("B")]);
    const { created, accept } = rubicon();
    const rejected = await db.run(["A", "B"], async () => {
      throw new RubiconError("rejected", "Рубікон відхилив трансфер: HTTP 400 — bad sku");
    });
    expect(rejected.error?.code).toBe("rejected");
    expect(db.row("A").transferId).toBeNull();

    const retry = await db.run(["A"], accept);
    expect(retry.transferIds).toEqual([transferOrderId(["A"])]);
    expect(db.row("B").transferId).toBeNull();
    expect(created.size).toBe(1);
  });

  /** Рубікон holds its answer until `answer()`. */
  function slowRubicon(accept: (payload: TransferPayload) => Promise<TransferResult>) {
    let release: (() => void) | null = null;
    const send = (payload: TransferPayload) =>
      new Promise<TransferResult>((resolve) => {
        release = () => resolve(accept(payload));
      });
    return {
      send,
      started: () => vi.waitFor(() => expect(release).not.toBeNull()),
      answer: () => release?.()
    };
  }

  it("two tablets read overlapping selections at once: the second sends nothing and takes nothing", async () => {
    const db = memoryDb([stored("A"), stored("B"), stored("C")]);
    const { created, accept } = rubicon();
    const slow = slowRubicon(accept);

    const tablet2Groups = db.groups(["A", "B", "C"]);
    const tablet1 = db.run(["A", "B"], slow.send);
    await slow.started();
    const tablet2 = await documentTransferGroups(tablet2Groups, db.steps(accept));

    expect(tablet2.error).toEqual({ code: "conflict", message: DOCUMENT_CONFLICT_MESSAGE });
    expect(tablet2.transferIds).toEqual([]);
    expect(db.row("C").transferId).toBeNull();
    slow.answer();
    expect((await tablet1).error).toBeNull();
    expect(created.size).toBe(1);
    const x = transferOrderId(["A", "B"]);
    expect([db.row("A").transferId, db.row("B").transferId]).toEqual([x, x]);
  });

  it("a tablet reading while another call is in flight resends that same orderId", async () => {
    const db = memoryDb([stored("A"), stored("B"), stored("C")]);
    const { created, accept } = rubicon();
    const slow = slowRubicon(accept);

    const tablet1 = db.run(["A", "B"], slow.send);
    await slow.started();
    const tablet2 = await db.run(["A", "B", "C"], accept);
    slow.answer();
    await tablet1;

    const x = transferOrderId(["A", "B"]);
    expect(tablet2.transferIds).toEqual([x, transferOrderId(["C"])]);
    expect([...created.keys()].sort()).toEqual([x, transferOrderId(["C"])].sort());
    expect(db.row("A").transferId).toBe(x);
  });

  it("marking never overwrites a task another request already documented", async () => {
    const db = memoryDb([stored("A")]);
    const { accept } = rubicon();
    const [stale] = db.groups(["A"]);
    await db.run(["A"], accept);
    const documentedAt = db.row("A").documentedAt;

    const late = await documentTransferGroups(
      [{ ...stale, resumed: true, payload: { ...stale.payload, orderId: "late-order" } }],
      db.steps(accept)
    );
    expect(late.documented).toBe(0);
    expect(db.row("A").transferId).toBe(transferOrderId(["A"]));
    expect(db.row("A").documentedAt).toBe(documentedAt);
  });
});

describe("rubiconTransferService.sendTransfer", () => {
  function stubRubiconEnv(env: Record<string, string>) {
    for (const name of [
      "RUBICON_MODE",
      "RUBICON_API_URL",
      "RUBICON_TOKEN_URL",
      "RUBICON_CLIENT_ID",
      "RUBICON_CLIENT_SECRET",
      "RUBICON_SCOPE",
      "RUBICON_TIMEOUT_MS"
    ]) {
      vi.stubEnv(name, env[name] ?? "");
    }
  }

  it("stub mode logs the exact payload, calls nothing and returns the same orderId", async () => {
    stubRubiconEnv({ ...LIVE_ENV, RUBICON_MODE: "stub" });
    const { fetchMock } = stubFetch();
    expect(await rubiconTransferService.sendTransfer(PAYLOAD)).toEqual({
      orderId: PAYLOAD.orderId,
      delivered: false
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logs).toContainEqual(["[rubicon:stub] transfer payload", JSON.stringify(PAYLOAD)]);
  });

  it("refuses an explicit live mode with an incomplete config, naming the variables only in the log", async () => {
    stubRubiconEnv({ RUBICON_MODE: "live", RUBICON_API_URL: CONFIG.apiUrl });
    const { fetchMock } = stubFetch();
    const error = await rubiconFailure(rubiconTransferService.sendTransfer(PAYLOAD));
    expect(error.kind).toBe("config");
    expect(error.maybeCreated).toBe(false);
    expect(error.message).toBe("Рубікон не налаштовано — зверніться до адміністратора");
    expect(JSON.stringify(logs)).toContain("RUBICON_TOKEN_URL, RUBICON_CLIENT_ID, RUBICON_CLIENT_SECRET");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an unknown RUBICON_MODE sends nothing even with the full config", async () => {
    stubRubiconEnv({ ...LIVE_ENV, RUBICON_MODE: "off" });
    const { fetchMock } = stubFetch();
    const error = await rubiconFailure(rubiconTransferService.sendTransfer(PAYLOAD));
    expect(error.kind).toBe("config");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("live mode delivers through the API", async () => {
    stubRubiconEnv(LIVE_ENV);
    const { apiCalls } = stubFetch();
    expect(await rubiconTransferService.sendTransfer(PAYLOAD)).toEqual({
      orderId: PAYLOAD.orderId,
      delivered: true
    });
    expect(apiCalls).toHaveLength(1);
  });
});
