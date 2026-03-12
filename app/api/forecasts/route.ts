import { requireAdmin } from "@/api/auth";
import { forecastSchema } from "@/api/schemas";
import { handleApiError, ok, parseJsonBody } from "@/api/http";
import { forecastRepository } from "@/repositories/forecast.repository";
import { taskGenerationService } from "@/services/task-generation/task-generation.service";

export async function GET() {
  try {
    await requireAdmin();
    return ok(await forecastRepository.list());
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const payload = forecastSchema.parse(await parseJsonBody(request));
    const forecast = await forecastRepository.create({
      ...payload,
      hour: new Date(payload.hour)
    });
    await taskGenerationService.generateForBranchProduct(forecast.branchId, forecast.productId);
    return ok(forecast, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
