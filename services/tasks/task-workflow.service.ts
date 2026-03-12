import { TaskStatus } from "@prisma/client";

import { formatTitle } from "@/lib/utils";
import { planningRepository } from "@/repositories/planning.repository";
import { taskRepository } from "@/repositories/task.repository";
import { taskGenerationService } from "@/services/task-generation/task-generation.service";

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

    return planningRepository.transaction(async (db) => {
      return db.task.update({
        where: { id },
        data: {
          status: TaskStatus.IN_PROGRESS,
          startedAt: new Date()
        }
      });
    });
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

    await taskGenerationService.generateForBranchProduct(task.branchId, task.productId);

    return completedTask;
  },

  async cancelTask(id: string) {
    const task = await taskRepository.getById(id);
    if (!task) {
      throw new Error("Task not found");
    }

    if (![TaskStatus.NEW, TaskStatus.IN_PROGRESS].includes(task.status)) {
      throw new Error("Only new or in-progress tasks can be cancelled");
    }

    return planningRepository.transaction(async (db) =>
      db.task.update({
        where: { id },
        data: {
          status: TaskStatus.CANCELLED,
          timelinessStatus: getTimeliness(task.expectedReadyAt)
        }
      })
    );
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

    return planningRepository.transaction(async (db) => {
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
        return db.task.update({
          where: {
            id: activeTask.id
          },
          data: payload
        });
      }

      return db.task.create({
        data: {
          ...payload,
          status: TaskStatus.NEW
        }
      });
    });
  }
};
