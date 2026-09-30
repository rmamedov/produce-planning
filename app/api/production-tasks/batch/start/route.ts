import { handleApiError, ok, parseJsonBody } from "@/api/http";
import { taskIdsSchema } from "@/api/schemas";
import { productionTaskWorkflowService } from "@/services/production-tasks/production-task-workflow.service";

export async function POST(request: Request) {
  try {
    const { task_ids } = taskIdsSchema.parse(await parseJsonBody(request));
    return ok(await productionTaskWorkflowService.startBatch(task_ids));
  } catch (error) {
    return handleApiError(error);
  }
}
