import { isValidTaskGeneratorRequest } from "@/api/cron";
import { requireAdmin } from "@/api/auth";
import { handleApiError, ok } from "@/api/http";
import { taskGenerationService } from "@/services/task-generation/task-generation.service";
import { demoTaskGenerationService } from "@/services/tasks/demo-task-generation.service";

export async function POST(request: Request) {
  try {
    if (isValidTaskGeneratorRequest(request)) {
      return ok(await taskGenerationService.generateAll());
    }

    await requireAdmin();
    return ok(await demoTaskGenerationService.generateFromAdmin());
  } catch (error) {
    return handleApiError(error);
  }
}
