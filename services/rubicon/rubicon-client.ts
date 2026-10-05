// HTTP client of the e-com external API (Рубікон production transfers):
// OAuth2 client_credentials against identity-service, then a Bearer POST.
// Unit-tested in tests/rubicon-transfer.test.ts with a mocked global fetch.

import type { TransferPayload } from "@/services/rubicon/rubicon-payload";

export const RUBICON_DEFAULT_SCOPE = "ecom--dams--transfer-orchestrator-service:transfer--create";
export const RUBICON_DEFAULT_TIMEOUT_MS = 15_000;
export const RUBICON_RETRY_DELAY_MS = 1_000;

// Cloudflare in front of identity-service rejects some default User-Agents
// (HTTP 403 «error code: 1010»), so every call sends an explicit one.
const USER_AGENT = "produce-planning/1.0";

const TOKEN_EXPIRY_MARGIN_S = 60;
const LOG_BODY_LIMIT = 2048;
const MESSAGE_BODY_LIMIT = 200;

export interface RubiconConfig {
  apiUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope: string;
  timeoutMs: number;
}

export type RubiconMode =
  | { mode: "stub" }
  | { mode: "live"; config: RubiconConfig }
  | { mode: "misconfigured"; missing: string[] };

const REQUIRED_ENV = ["RUBICON_API_URL", "RUBICON_TOKEN_URL", "RUBICON_CLIENT_ID", "RUBICON_CLIENT_SECRET"] as const;

/**
 * `RUBICON_MODE=stub` never calls out; `live` demands the full config and
 * fails loudly without it; unset — live only when the config is complete.
 * Any other value (off, false, test…) is refused rather than read as unset,
 * which would go live on a host that has the credentials.
 */
export function resolveRubiconMode(env: Record<string, string | undefined>): RubiconMode {
  const requested = env.RUBICON_MODE?.trim().toLowerCase() ?? "";
  if (requested === "stub") return { mode: "stub" };
  if (requested && requested !== "live") return { mode: "misconfigured", missing: ["RUBICON_MODE (stub|live)"] };

  const value = (name: string) => env[name]?.trim() ?? "";
  const missing = REQUIRED_ENV.filter((name) => !value(name));
  if (missing.length) {
    return requested === "live" ? { mode: "misconfigured", missing } : { mode: "stub" };
  }

  const timeoutMs = Number(value("RUBICON_TIMEOUT_MS"));
  return {
    mode: "live",
    config: {
      apiUrl: value("RUBICON_API_URL"),
      tokenUrl: value("RUBICON_TOKEN_URL"),
      clientId: value("RUBICON_CLIENT_ID"),
      clientSecret: value("RUBICON_CLIENT_SECRET"),
      scope: value("RUBICON_SCOPE") || RUBICON_DEFAULT_SCOPE,
      timeoutMs: Number.isInteger(timeoutMs) && timeoutMs > 0 ? timeoutMs : RUBICON_DEFAULT_TIMEOUT_MS
    }
  };
}

export type RubiconErrorKind = "config" | "auth" | "unreachable" | "rejected";

/** The message is user-facing (Ukrainian); `retryable` marks transient failures. */
export class RubiconError extends Error {
  /** A POST got no definite answer (timeout, network error, 5xx): the transfer may exist after all. */
  maybeCreated = false;

  constructor(
    public kind: RubiconErrorKind,
    message: string,
    public retryable = false
  ) {
    super(message);
    this.name = "RubiconError";
  }
}

/** The variable names go to the server log only — the endpoint has no login. */
export function rubiconConfigError(missing: string[]) {
  console.error(`[rubicon] not configured — check ${missing.join(", ")}`);
  return new RubiconError("config", "Рубікон не налаштовано — зверніться до адміністратора");
}

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function logBody(body: string) {
  return body.length > LOG_BODY_LIMIT ? `${body.slice(0, LOG_BODY_LIMIT)}…` : body;
}

function shortBody(body: string, limit = MESSAGE_BODY_LIMIT) {
  const compact = body.replace(/\s+/g, " ").trim();
  return compact.length > limit ? `${compact.slice(0, limit)}…` : compact;
}

function causeOf(error: unknown) {
  if (!(error instanceof Error)) return String(error);
  const code = (error.cause as { code?: unknown } | undefined)?.code;
  return typeof code === "string" ? `${error.name}: ${error.message} (${code})` : `${error.name}: ${error.message}`;
}

function unreachableError(url: string, error: unknown) {
  console.error(`[rubicon] ${hostOf(url)} unreachable — ${causeOf(error)}`);
  return new RubiconError(
    "unreachable",
    `Рубікон недоступний: ${hostOf(url)} не відповідає. Задачі лишились у «Виконаних» — спробуйте пізніше.`,
    true
  );
}

function authError(status: number, body: string) {
  let reason = "";
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    if (typeof parsed.error === "string") reason = parsed.error;
  } catch {
    // Not JSON (e.g. a Cloudflare HTML page) — fall back to the raw text.
  }
  reason ||= shortBody(body, 80);
  console.error(`[rubicon] identity HTTP ${status} ${logBody(body)}`);
  return new RubiconError(
    "auth",
    `Не вдалося авторизуватися в Рубіконі (identity: HTTP ${status}${reason ? ` ${reason}` : ""})`,
    status >= 500
  );
}

function rejectedError(status: number, body: string) {
  const reason = shortBody(body);
  return new RubiconError(
    "rejected",
    `Рубікон відхилив трансфер: HTTP ${status}${reason ? ` — ${reason}` : ""}`,
    status >= 500
  );
}

export interface RubiconClientDeps {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface RubiconResponse {
  status: number;
  body: string;
}

export function createRubiconClient({
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
}: RubiconClientDeps = {}) {
  let cached: { key: string; token: string; expiresAt: number } | null = null;
  let inFlight: { key: string; promise: Promise<string> } | null = null;

  async function send(
    url: string,
    init: { method: "POST"; headers: Record<string, string>; body: string },
    timeoutMs: number
  ): Promise<RubiconResponse> {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: { ...init.headers, Accept: "application/json", "User-Agent": USER_AGENT },
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      throw unreachableError(url, error);
    }
    return { status: response.status, body: await response.text().catch(() => "") };
  }

  async function requestToken(config: RubiconConfig): Promise<{ token: string; expiresIn: number }> {
    const response = await send(
      config.tokenUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: config.clientId,
          client_secret: config.clientSecret,
          scope: config.scope
        }).toString()
      },
      config.timeoutMs
    );
    if (response.status < 200 || response.status >= 300) {
      throw authError(response.status, response.body);
    }

    let parsed: { access_token?: unknown; expires_in?: unknown } = {};
    try {
      parsed = JSON.parse(response.body) ?? {};
    } catch {
      // Handled below as a missing token.
    }
    if (typeof parsed.access_token !== "string" || !parsed.access_token) {
      throw new RubiconError("auth", "Не вдалося авторизуватися в Рубіконі (identity: відповідь без access_token)");
    }
    return {
      token: parsed.access_token,
      expiresIn: typeof parsed.expires_in === "number" ? parsed.expires_in : 0
    };
  }

  /** Cached until `expires_in - 60 s`; concurrent callers share one in-flight request. */
  function getToken(config: RubiconConfig): Promise<string> {
    const key = `${config.tokenUrl}\n${config.clientId}\n${config.scope}`;
    if (cached?.key === key && now() < cached.expiresAt) {
      return Promise.resolve(cached.token);
    }
    if (inFlight?.key === key) {
      return inFlight.promise;
    }

    const promise = requestToken(config)
      .then(({ token, expiresIn }) => {
        cached = { key, token, expiresAt: now() + Math.max(0, expiresIn - TOKEN_EXPIRY_MARGIN_S) * 1000 };
        return token;
      })
      .finally(() => {
        if (inFlight?.promise === promise) inFlight = null;
      });
    inFlight = { key, promise };
    return promise;
  }

  function dropToken(token: string) {
    if (cached?.token === token) cached = null;
  }

  function postTransfer(config: RubiconConfig, token: string, payload: TransferPayload) {
    return send(
      config.apiUrl,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      },
      config.timeoutMs
    );
  }

  return {
    getToken,

    /**
     * 401 → fresh token, once. Network error / timeout / 5xx → one more
     * attempt after 1 s with the same orderId, which Рубікон deduplicates.
     * The final error carries `maybeCreated` when any POST was ambiguous.
     */
    async createTransfer(config: RubiconConfig, payload: TransferPayload): Promise<RubiconResponse> {
      let refreshed = false;
      let maybeCreated = false;
      const post = async (token: string) => {
        try {
          const response = await postTransfer(config, token, payload);
          if (response.status >= 500) maybeCreated = true;
          return response;
        } catch (error) {
          maybeCreated = true;
          throw error;
        }
      };

      for (let attempt = 1; ; attempt += 1) {
        try {
          let token = await getToken(config);
          let response = await post(token);
          if (response.status === 401 && !refreshed) {
            refreshed = true;
            dropToken(token);
            token = await getToken(config);
            response = await post(token);
          }

          const log = `[rubicon] transfer ${payload.orderId} → HTTP ${response.status} ${logBody(response.body)}`;
          if (response.status >= 200 && response.status < 300) {
            console.info(log);
            return response;
          }
          console.error(log);
          throw rejectedError(response.status, response.body);
        } catch (error) {
          if (attempt > 1 || !(error instanceof RubiconError) || !error.retryable) {
            if (error instanceof RubiconError) error.maybeCreated = maybeCreated;
            throw error;
          }
          await sleep(RUBICON_RETRY_DELAY_MS);
        }
      }
    }
  };
}
