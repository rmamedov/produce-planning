import { requireAdmin } from "@/api/auth";
import { handleApiError, noContent } from "@/api/http";
import { assortmentRepository } from "@/repositories/assortment.repository";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    await assortmentRepository.delete(id);
    return noContent();
  } catch (error) {
    return handleApiError(error);
  }
}
