export const runtime = "nodejs";

import { requireAdmin } from "@/api/auth";
import { handleApiError, ok } from "@/api/http";
import { localStorageService } from "@/services/file-storage/local-storage.service";

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new Error("Image file is required");
    }

    const photoUrl = await localStorageService.saveImage(file);
    return ok({ photoUrl }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
