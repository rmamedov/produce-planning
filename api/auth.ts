import { cookies } from "next/headers";

import { AUTH_COOKIE_NAME, verifySessionToken } from "@/services/auth/session";

export async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token || !verifySessionToken(token)) {
    throw new Error("Unauthorized");
  }
}
