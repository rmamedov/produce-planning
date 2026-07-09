import { NextRequest } from "next/server";

import { handleApiError, ok } from "@/api/http";
import { productionArchiveService } from "@/services/archive/production-archive.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lists archive files available on disk (newest first). */
export async function GET() {
  try {
    return ok({ archives: await productionArchiveService.list() });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Runs archiving now: tasks/forecast rows with history_date older than
 * `days` (default 7) are written to disk and removed from the database.
 */
export async function POST(request: NextRequest) {
  try {
    let days = 7;
    try {
      const body = (await request.json()) as { days?: unknown };
      if (typeof body?.days === "number" && Number.isFinite(body.days) && body.days >= 1) {
        days = Math.floor(body.days);
      }
    } catch {
      // no/invalid body — keep the default
    }

    return ok(await productionArchiveService.run(days));
  } catch (error) {
    return handleApiError(error);
  }
}
