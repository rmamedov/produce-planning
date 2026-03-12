import { cookies } from "next/headers";

import { env } from "@/lib/env";

export const AUTH_COOKIE_NAME = "production-admin-session";

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return mismatch === 0;
}

async function sign(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.AUTH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return toHex(signature);
}

export async function createSessionToken(email: string) {
  const payload = `${email}:${Date.now()}`;
  return `${payload}.${await sign(payload)}`;
}

export async function verifySessionToken(token: string) {
  const separatorIndex = token.lastIndexOf(".");
  if (separatorIndex <= 0 || separatorIndex === token.length - 1) {
    return false;
  }

  const payload = token.slice(0, separatorIndex);
  const digest = token.slice(separatorIndex + 1);
  const expectedDigest = await sign(payload);
  return constantTimeEqual(digest, expectedDigest);
}

export async function setSessionCookie(email: string) {
  const cookieStore = await cookies();
  const secureCookies =
    process.env.AUTH_SECURE_COOKIES !== undefined
      ? process.env.AUTH_SECURE_COOKIES === "true"
      : process.env.NODE_ENV === "production";
  cookieStore.set(AUTH_COOKIE_NAME, await createSessionToken(email), {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies,
    path: "/",
    maxAge: 60 * 60 * 12
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
}
