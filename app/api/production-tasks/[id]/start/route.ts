import { handleApiError, ok } from "@/api/http";
import { productionTaskWorkflowService } from "@/services/production-tasks/production-task-workflow.service";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return ok(await productionTaskWorkflowService.start(id));
  } catch (error) {
    return handleApiError(error);
  }
}
