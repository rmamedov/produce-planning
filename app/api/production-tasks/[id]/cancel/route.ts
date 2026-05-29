import { handleApiError, ok } from "@/api/http";
import { productionTaskWorkflowService } from "@/services/production-tasks/production-task-workflow.service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // Optional cancellation reason (e.g. "Неможливо виготовити" cause).
    let reason: string | undefined;
    try {
      const body = (await request.json()) as { reason?: unknown };
      if (typeof body?.reason === "string" && body.reason.trim()) {
        reason = body.reason.trim();
      }
    } catch {
      reason = undefined;
    }

    return ok(await productionTaskWorkflowService.cancel(id, reason));
  } catch (error) {
    return handleApiError(error);
  }
}
