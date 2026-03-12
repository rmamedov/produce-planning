import { TaskStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { taskInclude } from "@/repositories/shared";

export const ACTIVE_TASK_STATUSES = [TaskStatus.NEW, TaskStatus.IN_PROGRESS] as const;

export const taskRepository = {
  list() {
    return prisma.task.findMany({
      include: taskInclude,
      orderBy: [
        { expectedReadyAt: "asc" },
        { createdAt: "desc" }
      ]
    });
  },

  listKitchen() {
    return prisma.task.findMany({
      include: taskInclude,
      where: {
        status: {
          in: [...ACTIVE_TASK_STATUSES]
        }
      },
      orderBy: [
        { priority: "asc" },
        { expectedReadyAt: "asc" }
      ]
    });
  },

  getById(id: string) {
    return prisma.task.findUnique({
      where: { id },
      include: taskInclude
    });
  }
};
