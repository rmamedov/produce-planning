import { NextRequest } from "next/server";

import { handleApiError, ok } from "@/api/http";
import { productionTaskGenerateSchema } from "@/api/schemas";
import { productionTaskGenerationService } from "@/services/production-tasks/production-task-generation.service";

export async function POST(request: NextRequest) {
  try {
    // filial_id can be passed via query (?filial_id=) or JSON body; both optional.
    const queryFilial = request.nextUrl.searchParams.get("filial_id");
    let bodyFilial: unknown;
    try {
      const body = await request.json();
      bodyFilial = (body as { filial_id?: unknown })?.filial_id;
    } catch {
      bodyFilial = undefined;
    }

    const { filial_id } = productionTaskGenerateSchema.parse({
      filial_id: queryFilial ?? bodyFilial ?? undefined
    });

    const summary = await productionTaskGenerationService.generate(filial_id);

    return ok(summary, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
