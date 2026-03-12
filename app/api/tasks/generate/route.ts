import { isValidTaskGeneratorRequest } from "@/api/cron";
import { requireAdmin } from "@/api/auth";
import { handleApiError, ok } from "@/api/http";
import { taskGenerationService } from "@/services/task-generation/task-generation.service";

export async function POST(request: Request) {
  try {
    if (!isValidTaskGeneratorRequest(request)) {
      await requireAdmin();
    }
    return ok(await taskGenerationService.generateAll());
  } catch (error) {
    return handleApiError(error);
  }
}
