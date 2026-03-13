import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/api/auth";

export async function GET(request: NextRequest) {
  await requireAdmin();

  const { searchParams } = new URL(request.url);
  const branchId = searchParams.get("branchId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where: Record<string, unknown> = {};

  if (branchId) {
    where.task = { branchId };
  }
  if (from || to) {
    where.changedAt = {};
    if (from) (where.changedAt as Record<string, unknown>).gte = new Date(from);
    if (to) (where.changedAt as Record<string, unknown>).lte = new Date(to);
  }

  const logs = await prisma.taskStatusLog.findMany({
    where,
    include: {
      task: {
        include: {
          branch: true,
          product: true
        }
      }
    },
    orderBy: { changedAt: "desc" },
    take: 1000
  });

  return NextResponse.json(logs);
}
