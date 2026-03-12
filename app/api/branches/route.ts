import { requireAdmin } from "@/api/auth";
import { branchSchema } from "@/api/schemas";
import { handleApiError, ok, parseJsonBody } from "@/api/http";
import { branchRepository } from "@/repositories/branch.repository";

export async function GET() {
  try {
    await requireAdmin();
    return ok(await branchRepository.list());
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const payload = branchSchema.parse(await parseJsonBody(request));
    return ok(await branchRepository.create(payload), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
