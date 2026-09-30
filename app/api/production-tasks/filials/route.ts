import { handleApiError, ok } from "@/api/http";
import { presentationRepository } from "@/repositories/presentation.repository";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(await presentationRepository.listFilials());
  } catch (error) {
    return handleApiError(error);
  }
}
