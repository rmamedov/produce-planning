import { requireAdmin } from "@/api/auth";
import { handleApiError, ok } from "@/api/http";
import { dashboardService } from "@/services/dashboard/dashboard.service";

export async function GET() {
  try {
    await requireAdmin();
    const stats = await dashboardService.getStats();
    return ok(stats);
  } catch (error) {
    return handleApiError(error);
  }
}
