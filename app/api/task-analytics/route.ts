import { requireAdmin } from "@/api/auth";
import { handleApiError, ok } from "@/api/http";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    const createdAtFilter = Object.keys(dateFilter).length > 0 ? dateFilter : undefined;

    const branches = await prisma.branch.findMany({
      select: {
        id: true,
        name: true,
        tasks: {
          where: createdAtFilter ? { createdAt: createdAtFilter } : undefined,
          select: {
            id: true,
            status: true,
            createdAt: true,
            completedAt: true,
            expectedReadyAt: true
          }
        }
      }
    });

    const result = branches.map((branch) => {
      const totalTasks = branch.tasks.length;
      const completedTasks = branch.tasks.filter((t) => t.status === "DONE");

      let avgCompletionMinutes = 0;
      if (completedTasks.length > 0) {
        const totalMinutes = completedTasks.reduce((sum, t) => {
          if (!t.completedAt) return sum;
          const diffMs = t.completedAt.getTime() - t.createdAt.getTime();
          return sum + diffMs / 60_000;
        }, 0);
        avgCompletionMinutes = Math.round((totalMinutes / completedTasks.length) * 10) / 10;
      }

      const onTimeTasks = completedTasks.filter(
        (t) => t.completedAt && t.completedAt <= t.expectedReadyAt
      );
      const onTimeRate = completedTasks.length > 0 ? Math.round((onTimeTasks.length / completedTasks.length) * 100) / 100 : 0;

      return {
        branchId: branch.id,
        branchName: branch.name,
        totalTasks,
        completedTasks: completedTasks.length,
        avgCompletionMinutes,
        onTimeRate
      };
    });

    return ok({ branches: result });
  } catch (error) {
    return handleApiError(error);
  }
}
