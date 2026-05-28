import { TaskStatus } from "@prisma/client";

import { productionTaskRepository } from "@/repositories/production-task.repository";

async function requireTask(id: string) {
  const task = await productionTaskRepository.getById(id);
  if (!task) {
    throw new Error("Production task not found");
  }
  return task;
}

export const productionTaskWorkflowService = {
  async start(id: string) {
    const task = await requireTask(id);

    if (task.status !== TaskStatus.NEW) {
      throw new Error("only NEW tasks can be started");
    }

    return productionTaskRepository.update(id, {
      status: TaskStatus.IN_PROGRESS,
      startedAt: new Date()
    });
  },

  async complete(id: string) {
    const task = await requireTask(id);

    if (task.status !== TaskStatus.NEW && task.status !== TaskStatus.IN_PROGRESS) {
      throw new Error("only active tasks can be completed");
    }

    return productionTaskRepository.update(id, {
      status: TaskStatus.DONE,
      startedAt: task.startedAt ?? new Date(),
      completedAt: new Date()
    });
  },

  async cancel(id: string) {
    const task = await requireTask(id);

    if (task.status === TaskStatus.DONE) {
      throw new Error("only active tasks can be cancelled");
    }

    return productionTaskRepository.update(id, {
      status: TaskStatus.CANCELLED
    });
  }
};
