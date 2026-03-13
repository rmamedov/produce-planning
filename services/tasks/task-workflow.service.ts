import { TaskStatus } from "@prisma/client";

import { formatTitle } from "@/lib/utils";
import { planningRepository } from "@/repositories/planning.repository";
import { taskRepository } from "@/repositories/task.repository";
import { taskGenerationService } from "@/services/task-generation/task-generation.service";
import { taskRealtimeService } from "@/services/tasks/task-realtime.service";
import { taskStatusLogService } from "@/services/tasks/task-status-log.service";

function getTimeliness(expectedReadyAt: Date) {
  return expectedReadyAt.getTime() <= Date.now() ? "OVERDUE" : "ON_TIME";
}

export const taskWorkflowService = {
  async startTask(id: string) {
    const task = await taskRepository.getById(id);
    if (!task) {
      throw new Error("Task not found");
    }

    if (task.status !== TaskStatus.NEW) {
      throw new Error("Only new tasks can be started");
    }

    const updatedTask = await planningRepository.transaction(async (db) => {
      const result = await db.task.update({
        where: { id },
        data: {
          status: TaskStatus.IN_PROGRESS,
          startedAt: new Date()
        }
      });
      await taskStatusLogService.log(id, "NEW", "IN_PROGRESS", db);
      return result;
    });

    taskRealtimeService.publishTaskUpdate({
      reason: "started",
      branchId: updatedTask.branchId,
      productId: updatedTask.productId,
      taskId: updatedTask.id
    });

    return updatedTask;
  },

  async completeTask(id: string) {
    const task = await taskRepository.getById(id);
    if (!task) {
      throw new Error("Task not found");
    }

    if (task.status !== TaskStatus.IN_PROGRESS) {
      throw new Error("Only tasks in progress can be completed");
    }

    const completedTask = await planningRepository.transaction(async (db) => {
      const completed = await db.task.update({
        where: { id },
        data: {
          status: TaskStatus.DONE,
          completedAt: new Date(),
          timelinessStatus: getTimeliness(task.expectedReadyAt)
        }
      });
      await taskStatusLogService.log(id, "IN_PROGRESS", "DONE", db);

      const assortment = await db.assortment.findUnique({
        where: {
          branchId: task.branchId
        }
      });

      if (!assortment) {
        throw new Error("Assortment not found for task branch");
      }

      await db.assortmentItem.update({
        where: {
          assortmentId_productId: {
            assortmentId: assortment.id,
            productId: task.productId
          }
        },
        data: {
          currentStock: {
            increment: task.quantity
          }
        }
      });

      return completed;
    });

    await taskGenerationService.generateForBranchProduct(task.branchId, task.productId, {
      notify: false
    });

    taskRealtimeService.publishTaskUpdate({
      reason: "completed",
      branchId: completedTask.branchId,
      productId: completedTask.productId,
      taskId: completedTask.id
    });

    return completedTask;
  },

  async cancelTask(id: string) {
    const task = await taskRepository.getById(id);
    if (!task) {
      throw new Error("Task not found");
    }

    if (!([TaskStatus.NEW, TaskStatus.IN_PROGRESS] as TaskStatus[]).includes(task.status)) {
      throw new Error("Only new or in-progress tasks can be cancelled");
    }

    const cancelledTask = await planningRepository.transaction(async (db) => {
      const result = await db.task.update({
        where: { id },
        data: {
          status: TaskStatus.CANCELLED,
          timelinessStatus: getTimeliness(task.expectedReadyAt)
        }
      });
      await taskStatusLogService.log(id, task.status, "CANCELLED", db);
      return result;
    });

    taskRealtimeService.publishTaskUpdate({
      reason: "cancelled",
      branchId: cancelledTask.branchId,
      productId: cancelledTask.productId,
      taskId: cancelledTask.id
    });

    return cancelledTask;
  },

  async upsertManualTask(input: {
    branchId: string;
    productId: string;
    quantity: number;
    priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
    expectedReadyAt: Date;
    comment?: string;
  }) {
    const assortmentItemId = await planningRepository.findAssortmentItemId(input.branchId, input.productId);
    if (!assortmentItemId) {
      throw new Error("Product is not configured in the selected branch assortment");
    }

    const task = await planningRepository.transaction(async (db) => {
      await planningRepository.lockAssortmentItem(db, assortmentItemId);

      const assortmentItem = await db.assortmentItem.findUnique({
        where: {
          id: assortmentItemId
        },
        include: {
          product: {
            include: {
              technologicalCard: true
            }
          }
        }
      });

      if (!assortmentItem) {
        throw new Error("Assortment item not found");
      }

      const activeTask = await db.task.findFirst({
        where: {
          branchId: input.branchId,
          productId: input.productId,
          status: {
            in: [TaskStatus.NEW, TaskStatus.IN_PROGRESS]
          }
        }
      });

      const payload = {
        branchId: input.branchId,
        productId: input.productId,
        quantity: input.quantity,
        title: formatTitle(assortmentItem.product.name, input.quantity),
        priority: input.priority,
        allocatedTimeMinutes: assortmentItem.product.technologicalCard?.typicalCookingTimeMinutes ?? 30,
        expectedReadyAt: input.expectedReadyAt,
        priorityReason: input.comment?.trim() || "Створено вручну адміністратором.",
        timelinessStatus: getTimeliness(input.expectedReadyAt),
        manual: true,
        comment: input.comment?.trim() || null
      } as const;

      if (activeTask) {
        const updated = await db.task.update({
          where: {
            id: activeTask.id
          },
          data: payload
        });
        await taskStatusLogService.log(activeTask.id, activeTask.status, activeTask.status, db);
        return updated;
      }

      const created = await db.task.create({
        data: {
          ...payload,
          status: TaskStatus.NEW
        }
      });
      await taskStatusLogService.log(created.id, null, "NEW", db);
      return created;
    });

    taskRealtimeService.publishTaskUpdate({
      reason: "manual-upsert",
      branchId: task.branchId,
      productId: task.productId,
      taskId: task.id
    });

    return task;
  }
};
