import { requireAdmin } from "@/api/auth";
import { handleApiError, ok, parseJsonBody } from "@/api/http";
import { presentationSchema } from "@/api/schemas";
import { presentationRepository, toPresentationData } from "@/repositories/presentation.repository";

export const dynamic = "force-dynamic";

// Public: kitchen tablets pick a presentation without an admin session.
export async function GET() {
  try {
    return ok({ presentations: await presentationRepository.list() });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const payload = presentationSchema.parse(await parseJsonBody(request));
    return ok(await presentationRepository.create(toPresentationData(payload)), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
