import { NextResponse } from "next/server";
import { ZodError } from "zod";

/** An error whose message is safe to show to the user, sent with an explicit status. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "HttpError";
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
    return NextResponse.json({ message: error.message }, { status: error.status });
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
