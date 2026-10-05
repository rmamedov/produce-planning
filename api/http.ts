import { NextResponse } from "next/server";
import { ZodError } from "zod";

/** An error whose message is safe to show to the user, sent with an explicit status and optional extra fields. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function hostnameOf(value: string) {
  try {
    return new URL(value.includes("://") ? value : `http://${value}`).hostname;
  } catch {
    return "";
  }
}

/**
 * Refuses browser requests sent from another site (CSRF) — the kitchen
 * endpoints have no login. Hostnames only: proxies may drop the port from Host.
 * Not an authentication: a client without Origin/Sec-Fetch-Site gets through.
 */
export function assertSameOrigin(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host") || "";
  const crossSite = site !== null && site !== "same-origin" && site !== "none";
  if (crossSite || (origin !== null && (!host || hostnameOf(origin) !== hostnameOf(host)))) {
    throw new HttpError(403, "Запит з іншого сайту відхилено");
  }
}

export async function parseJsonBody<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

export function handleApiError(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json({ ...error.details, message: error.message }, { status: error.status });
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        message: "Validation failed",
        errors: error.flatten()
      },
      { status: 400 }
    );
  }

  const message = error instanceof Error ? error.message : "Internal server error";
  const lowered = message.toLowerCase();
  const status =
    message === "Unauthorized" ? 401 : lowered.includes("not found") ? 404 : lowered.includes("only ") ? 400 : 500;
  return NextResponse.json({ message }, { status });
}
