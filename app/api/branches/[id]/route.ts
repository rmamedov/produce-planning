import { requireAdmin } from "@/api/auth";
import { handleApiError, noContent, ok, parseJsonBody } from "@/api/http";
import { branchSchema } from "@/api/schemas";
import { branchRepository } from "@/repositories/branch.repository";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const payload = branchSchema.parse(await parseJsonBody(request));
    return ok(await branchRepository.update(id, payload));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    await branchRepository.delete(id);
    return noContent();
  } catch (error) {
    return handleApiError(error);
  }
}
