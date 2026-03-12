import { requireAdmin } from "@/api/auth";
import { handleApiError, noContent, ok, parseJsonBody } from "@/api/http";
import { productSchema } from "@/api/schemas";
import { productRepository } from "@/repositories/product.repository";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const payload = productSchema.parse(await parseJsonBody(request));
    return ok(
      await productRepository.update(id, {
        ...payload,
        photoUrl: payload.photoUrl || null,
        technologicalCardId: payload.technologicalCardId || null
      })
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    await productRepository.delete(id);
    return noContent();
  } catch (error) {
    return handleApiError(error);
  }
}
