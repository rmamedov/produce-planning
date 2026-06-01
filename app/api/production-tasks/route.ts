import { NextRequest } from "next/server";
import type { TaskPriority, TaskStatus } from "@prisma/client";

import { handleApiError, ok } from "@/api/http";
import { productionTaskQuerySchema } from "@/api/schemas";
import { getDepartmentName } from "@/domain/departments";
import { prisma } from "@/lib/prisma";
import { productionTaskRepository } from "@/repositories/production-task.repository";
import { resolveLagerInfos } from "@/services/silpo/silpo-product.service";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const query = productionTaskQuerySchema.parse({
      filial_id: searchParams.get("filial_id") ?? undefined,
      history_date: searchParams.get("history_date") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      priority: searchParams.get("priority") ?? undefined,
      department_id: searchParams.get("department_id") ?? undefined
    });

    const tasks = await productionTaskRepository.list({
      filialId: query.filial_id,
      departmentId: query.department_id,
      historyDate: query.history_date ? new Date(query.history_date) : undefined,
      status: query.status as TaskStatus | undefined,
      priority: query.priority as TaskPriority | undefined
    });

    // Lazily backfill product name + unit for tasks created before they were
    // stored (or when Silpo was unavailable at generation time).
    const missing = tasks.filter((task) => !task.lagerName || !task.lagerUnit);
    const resolvedName = new Map(tasks.map((task) => [task.lagerId, task.lagerName] as const));
    const resolvedUnit = new Map(tasks.map((task) => [task.lagerId, task.lagerUnit] as const));

    if (missing.length) {
      const infos = await resolveLagerInfos(missing.map((task) => task.lagerId));
      await Promise.all(
        missing.map(async (task) => {
          const info = infos.get(task.lagerId);
          if (!info) return;
          const name = info.name ?? task.lagerName ?? null;
          const unit = info.unit ?? task.lagerUnit ?? null;
          if (name) resolvedName.set(task.lagerId, name);
          if (unit) resolvedUnit.set(task.lagerId, unit);
          if ((info.name && info.name !== task.lagerName) || (info.unit && info.unit !== task.lagerUnit)) {
            await prisma.productionTask.update({
              where: { id: task.id },
              data: { lagerName: name, lagerUnit: unit }
            });
          }
        })
      );
    }

    return ok({
      generated_at: new Date().toISOString(),
      count: tasks.length,
      tasks: tasks.map((task) => ({
        id: task.id,
        filial_id: task.filialId,
        department_id: task.departmentId,
        department_name: getDepartmentName(task.departmentId),
        lager_id: task.lagerId,
        lager_name: resolvedName.get(task.lagerId) ?? task.lagerName ?? null,
        unit: resolvedUnit.get(task.lagerId) ?? task.lagerUnit ?? null,
        snapshot_hour: task.snapshotHour,
        history_date: task.historyDate.toISOString().split("T")[0],
        status: task.status,
        priority: task.priority,
        priority_level: task.priorityLevel,
        quantity: task.quantity,
        covered_hours: task.coveredHours,
        current_stock_qty: task.currentStockQty,
        reason: task.reason,
        operational_ready_at: task.operationalReadyAt?.toISOString() ?? null,
        is_overdue: task.operationalReadyAt ? task.operationalReadyAt.getTime() < Date.now() : false,
        created_at: task.createdAt.toISOString(),
        started_at: task.startedAt?.toISOString() ?? null,
        completed_at: task.completedAt?.toISOString() ?? null
      }))
    });
  } catch (error) {
    return handleApiError(error);
  }
}
