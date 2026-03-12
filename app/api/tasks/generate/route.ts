import { requireAdmin } from "@/api/auth";
import { handleApiError, ok } from "@/api/http";
import { taskGenerationService } from "@/services/task-generation/task-generation.service";

export async function POST() {
  try {
    await requireAdmin();
    return ok(await taskGenerationService.generateAll());
  } catch (error) {
    return handleApiError(error);
  }
}
