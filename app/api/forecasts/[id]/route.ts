import { requireAdmin } from "@/api/auth";
import { forecastSchema } from "@/api/schemas";
import { handleApiError, noContent, ok, parseJsonBody } from "@/api/http";
import { forecastRepository } from "@/repositories/forecast.repository";
import { taskGenerationService } from "@/services/task-generation/task-generation.service";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const payload = forecastSchema.parse(await parseJsonBody(request));
    const forecast = await forecastRepository.update(id, {
      ...payload,
      hour: new Date(payload.hour)
    });
    await taskGenerationService.generateForBranchProduct(forecast.branchId, forecast.productId);
    return ok(forecast);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const forecast = await forecastRepository.getById(id);
    if (!forecast) {
      throw new Error("Forecast not found");
    }
    await forecastRepository.delete(id);
    await taskGenerationService.generateForBranchProduct(forecast.branchId, forecast.productId);
    return noContent();
  } catch (error) {
    return handleApiError(error);
  }
}
