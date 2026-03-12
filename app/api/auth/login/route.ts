import { handleApiError, ok, parseJsonBody } from "@/api/http";
import { loginSchema } from "@/api/schemas";
import { authService } from "@/services/auth/auth.service";
import { setSessionCookie } from "@/services/auth/session";

export async function POST(request: Request) {
  try {
    const payload = loginSchema.parse(await parseJsonBody(request));

    const isValid = authService.authenticate(payload.email, payload.password);
    if (!isValid) {
      throw new Error("Unauthorized");
    }

    await setSessionCookie(payload.email);

    return ok({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
