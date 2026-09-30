import { handleApiError, ok, parseJsonBody } from "@/api/http";
import { batchCompleteSchema } from "@/api/schemas";
import { productionTaskWorkflowService } from "@/services/production-tasks/production-task-workflow.service";

export async function POST(request: Request) {
  try {
    const { items } = batchCompleteSchema.parse(await parseJsonBody(request));
    return ok(await productionTaskWorkflowService.completeBatch(items));
  } catch (error) {
    return handleApiError(error);
  }
}
