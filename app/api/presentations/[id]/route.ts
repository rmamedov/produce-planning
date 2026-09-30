import { requireAdmin } from "@/api/auth";
import { handleApiError, noContent, ok, parseJsonBody } from "@/api/http";
import { presentationSchema } from "@/api/schemas";
import { presentationRepository, toPresentationData } from "@/repositories/presentation.repository";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const payload = presentationSchema.parse(await parseJsonBody(request));
    return ok(await presentationRepository.update(id, toPresentationData(payload)));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    await presentationRepository.delete(id);
    return noContent();
  } catch (error) {
    return handleApiError(error);
  }
}
