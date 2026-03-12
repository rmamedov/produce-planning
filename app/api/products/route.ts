import { requireAdmin } from "@/api/auth";
import { handleApiError, ok, parseJsonBody } from "@/api/http";
import { productSchema } from "@/api/schemas";
import { productRepository } from "@/repositories/product.repository";

export async function GET() {
  try {
    await requireAdmin();
    return ok(await productRepository.list());
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const payload = productSchema.parse(await parseJsonBody(request));
    return ok(
      await productRepository.create({
        ...payload,
        photoUrl: payload.photoUrl || null,
        technologicalCardId: payload.technologicalCardId || null
      }),
      201
    );
  } catch (error) {
    return handleApiError(error);
  }
}
