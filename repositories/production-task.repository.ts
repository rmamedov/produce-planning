import type { TaskPriority, TaskStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

interface ListFilters {
  filialId?: number;
  historyDate?: Date;
  status?: TaskStatus;
  priority?: TaskPriority;
}

export const productionTaskRepository = {
  list(filters: ListFilters = {}) {
    const where: Record<string, unknown> = {};

    if (filters.filialId) {
      where.filialId = filters.filialId;
    }
    if (filters.historyDate) {
      where.historyDate = filters.historyDate;
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.priority) {
      where.priority = filters.priority;
    }

    return prisma.productionTask.findMany({
      where,
      orderBy: [
        { historyDate: "asc" },
        { priorityLevel: "asc" },
        { coveredHours: "asc" }
      ]
    });
  },

  getBySourceId(sourceId: string) {
    return prisma.productionTask.findUnique({
      where: { sourceId }
    });
  },

  getById(id: string) {
    return prisma.productionTask.findUnique({
      where: { id }
    });
  },

  update(id: string, data: Parameters<typeof prisma.productionTask.update>[0]["data"]) {
    return prisma.productionTask.update({
      where: { id },
      data
    });
  }
};
