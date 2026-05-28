import { NextRequest } from "next/server";
import type { TaskPriority, TaskStatus } from "@prisma/client";

import { handleApiError, ok } from "@/api/http";
import { productionTaskQuerySchema } from "@/api/schemas";
import { productionTaskRepository } from "@/repositories/production-task.repository";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const query = productionTaskQuerySchema.parse({
      filial_id: searchParams.get("filial_id") ?? undefined,
      history_date: searchParams.get("history_date") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      priority: searchParams.get("priority") ?? undefined
    });

    const tasks = await productionTaskRepository.list({
      filialId: query.filial_id,
      historyDate: query.history_date ? new Date(query.history_date) : undefined,
      status: query.status as TaskStatus | undefined,
      priority: query.priority as TaskPriority | undefined
    });

    return ok({
      generated_at: new Date().toISOString(),
      count: tasks.length,
      tasks: tasks.map((task) => ({
        id: task.id,
        filial_id: task.filialId,
        lager_id: task.lagerId,
        history_date: task.historyDate.toISOString().split("T")[0],
        status: task.status,
        priority: task.priority,
        priority_level: task.priorityLevel,
        quantity: task.quantity,
        covered_hours: task.coveredHours,
        reason: task.reason,
        created_at: task.createdAt.toISOString(),
        started_at: task.startedAt?.toISOString() ?? null,
        completed_at: task.completedAt?.toISOString() ?? null
      }))
    });
  } catch (error) {
    return handleApiError(error);
  }
}
