import { handleApiError, ok } from "@/api/http";
import { productionTaskCompleteSchema } from "@/api/schemas";
import { productionTaskWorkflowService } from "@/services/production-tasks/production-task-workflow.service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // The body is optional so pre-popup clients and integrations keep working.
    const body = productionTaskCompleteSchema.parse(
      await request.json().catch(() => ({}))
    );
    return ok(await productionTaskWorkflowService.complete(id, body.produced_qty));
  } catch (error) {
    return handleApiError(error);
  }
}
