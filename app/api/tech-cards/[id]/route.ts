import { requireAdmin } from "@/api/auth";
import { handleApiError, noContent, ok, parseJsonBody } from "@/api/http";
import { techCardSchema } from "@/api/schemas";
import { techCardRepository } from "@/repositories/tech-card.repository";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const payload = techCardSchema.parse(await parseJsonBody(request));
    return ok(await techCardRepository.update(id, payload));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    await techCardRepository.delete(id);
    return noContent();
  } catch (error) {
    return handleApiError(error);
  }
}
