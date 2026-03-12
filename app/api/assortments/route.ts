import { requireAdmin } from "@/api/auth";
import { handleApiError, ok, parseJsonBody } from "@/api/http";
import { assortmentSchema } from "@/api/schemas";
import { assortmentRepository } from "@/repositories/assortment.repository";
import { taskGenerationService } from "@/services/task-generation/task-generation.service";

export async function GET() {
  try {
    await requireAdmin();
    return ok(await assortmentRepository.list());
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const payload = assortmentSchema.parse(await parseJsonBody(request));
    const assortment = await assortmentRepository.upsert(payload);

    await Promise.all(
      assortment.items.map((item) => taskGenerationService.generateForBranchProduct(assortment.branchId, item.productId))
    );

    return ok(assortment, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
