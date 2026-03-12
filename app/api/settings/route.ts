import { requireAdmin } from "@/api/auth";
import { handleApiError, ok, parseJsonBody } from "@/api/http";
import { settingsSchema } from "@/api/schemas";
import { settingsRepository } from "@/repositories/settings.repository";

export async function GET() {
  try {
    await requireAdmin();
    return ok(await settingsRepository.getSingleton());
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    await requireAdmin();
    const payload = settingsSchema.parse(await parseJsonBody(request));
    return ok(await settingsRepository.update(payload));
  } catch (error) {
    return handleApiError(error);
  }
}
