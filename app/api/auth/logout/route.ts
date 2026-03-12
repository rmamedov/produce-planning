import { clearSessionCookie } from "@/services/auth/session";

export async function POST() {
  await clearSessionCookie();
  return new Response(null, { status: 204 });
}
