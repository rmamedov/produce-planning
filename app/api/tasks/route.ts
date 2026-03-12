import { requireAdmin } from "@/api/auth";
import { handleApiError, ok, parseJsonBody } from "@/api/http";
import { manualTaskSchema } from "@/api/schemas";
import { taskRepository } from "@/repositories/task.repository";
import { taskGenerationService } from "@/services/task-generation/task-generation.service";
import { taskWorkflowService } from "@/services/tasks/task-workflow.service";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const view = url.searchParams.get("view");
    const tasks = view === "kitchen" ? await taskRepository.listKitchen() : await taskRepository.list();
    return ok(tasks);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const payload = manualTaskSchema.parse(await parseJsonBody(request));
    const task = await taskWorkflowService.upsertManualTask({
      ...payload,
      expectedReadyAt: new Date(payload.expectedReadyAt)
    });
    await taskGenerationService.generateForBranchProduct(task.branchId, task.productId);
    return ok(task, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
