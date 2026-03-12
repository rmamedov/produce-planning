import { handleApiError, ok } from "@/api/http";
import { taskWorkflowService } from "@/services/tasks/task-workflow.service";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return ok(await taskWorkflowService.cancelTask(id));
  } catch (error) {
    return handleApiError(error);
  }
}
