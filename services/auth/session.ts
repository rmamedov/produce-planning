import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

import { env } from "@/lib/env";

export const AUTH_COOKIE_NAME = "production-admin-session";

function sign(value: string) {
  return createHmac("sha256", env.AUTH_SECRET).update(value).digest("hex");
}

export function createSessionToken(email: string) {
  const payload = `${email}:${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string) {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return false;
  }

  const [payload, digest] = parts;
  const expectedDigest = sign(payload);
  const left = Buffer.from(digest);
  const right = Buffer.from(expectedDigest);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

export async function setSessionCookie(email: string) {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, createSessionToken(email), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
}
