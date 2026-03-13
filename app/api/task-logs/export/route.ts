import { requireAdmin } from "@/api/auth";
import { handleApiError } from "@/api/http";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branchId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const where: Record<string, unknown> = {};

    if (branchId) {
      where.task = { branchId };
    }

    const changedAtFilter: Record<string, Date> = {};
    if (from) changedAtFilter.gte = new Date(from);
    if (to) changedAtFilter.lte = new Date(to);
    if (Object.keys(changedAtFilter).length > 0) {
      where.changedAt = changedAtFilter;
    }

    const logs = await prisma.taskStatusLog.findMany({
      where,
      include: {
        task: {
          include: {
            branch: { select: { name: true } },
            product: { select: { name: true } }
          }
        }
      },
      orderBy: { changedAt: "desc" }
    });

    const header = "Task ID,Task Title,Branch,Product,From Status,To Status,Changed At";
    const rows = logs.map((log) => {
      const fields = [
        log.taskId,
        `"${log.task.title.replace(/"/g, '""')}"`,
        `"${log.task.branch.name.replace(/"/g, '""')}"`,
        `"${log.task.product.name.replace(/"/g, '""')}"`,
        log.fromStatus ?? "",
        log.toStatus,
        log.changedAt.toISOString()
      ];
      return fields.join(",");
    });

    const csvString = [header, ...rows].join("\n");

    return new Response(csvString, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="task-logs-${Date.now()}.csv"`
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}
