import { NextResponse } from "next/server";

import { handleApiError, ok } from "@/api/http";
import { productionArchiveService } from "@/services/archive/production-archive.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reads one archived day (tasks + forecast rows) from disk. */
export async function GET(_: Request, { params }: { params: Promise<{ date: string }> }) {
  try {
    const { date } = await params;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: "INVALID_REQUEST", message: "date має бути у форматі YYYY-MM-DD" },
        { status: 400 }
      );
    }

    const payload = await productionArchiveService.read(date);
    if (!payload) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: `Немає архіву за ${date}` },
        { status: 404 }
      );
    }

    return ok(payload);
  } catch (error) {
    return handleApiError(error);
  }
}
