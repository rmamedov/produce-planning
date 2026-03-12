import { requireAdmin } from "@/api/auth";
import { handleApiError, ok, parseJsonBody } from "@/api/http";
import { techCardSchema } from "@/api/schemas";
import { techCardRepository } from "@/repositories/tech-card.repository";

export async function GET() {
  try {
    await requireAdmin();
    return ok(await techCardRepository.list());
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const payload = techCardSchema.parse(await parseJsonBody(request));
    return ok(await techCardRepository.create(payload), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
