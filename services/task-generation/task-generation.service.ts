import { Prisma, TaskStatus } from "@prisma/client";

import { formatTitle } from "@/lib/utils";
import { planningRepository } from "@/repositories/planning.repository";
import { settingsRepository } from "@/repositories/settings.repository";
import { evaluateTaskGeneration } from "@/services/task-generation/algorithm";
import { taskRealtimeService } from "@/services/tasks/task-realtime.service";

type GenerationResult =
  | {
      status: "created" | "updated" | "cancelled" | "unchanged";
      taskId?: string | null;
      assortmentItemId: string;
    }
  | {
      status: "skipped";
      assortmentItemId: string;
    };

async function runWithRetry<T>(callback: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await callback();
    } catch (error) {
      lastError = error;

      const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : null;
      if (code !== "P2002" && code !== "P2034") {
        throw error;
      }
    }
  }

  throw lastError;
}

function hasTaskGenerationChanges(
  result: GenerationResult | null
): result is GenerationResult & { taskId: string } {
  return Boolean(result && ["created", "updated", "cancelled"].includes(result.status));
}

export const taskGenerationService = {
  async generateForAssortmentItem(assortmentItemId: string): Promise<GenerationResult> {
    return runWithRetry(async () => {
      const settings = await settingsRepository.getSingleton();

      return planningRepository.transaction(async (db) => {
        const now = new Date();
        await planningRepository.lockAssortmentItem(db, assortmentItemId);

        const snapshot = await planningRepository.getSnapshot(
          db,
          assortmentItemId,
          now,
          settings.planningHorizonHours
        );

        if (!snapshot) {
          return {
            status: "skipped",
            assortmentItemId
          };
        }

        const activeTask = snapshot.activeTaskId
          ? await db.task.findUnique({
              where: {
                id: snapshot.activeTaskId
              }
            })
          : null;

        const decision = evaluateTaskGeneration(snapshot, now, settings.planningHorizonHours);

        if (activeTask?.manual) {
          return {
            status: "unchanged",
            taskId: activeTask.id,
            assortmentItemId
          };
        }

        if (!decision.shouldCreateTask || !decision.expectedReadyAt) {
          if (activeTask && !activeTask.manual && activeTask.status === TaskStatus.NEW) {
            const cancelledTask = await db.task.update({
              where: {
                id: activeTask.id
              },
              data: {
                status: TaskStatus.CANCELLED,
                priorityReason: "Автоматичне завдання скасоване: оновлений запас уже покриває попит.",
                timelinessStatus: decision.timelinessStatus
              }
            });

            return {
              status: "cancelled",
              taskId: cancelledTask.id,
              assortmentItemId
            };
          }

          return {
            status: "unchanged",
            taskId: activeTask?.id ?? null,
            assortmentItemId
          };
        }

        const taskData = {
          branchId: snapshot.branchId,
          productId: snapshot.productId,
          quantity: decision.taskQuantity,
          title: formatTitle(snapshot.productName, decision.taskQuantity),
          priority: decision.priority,
          allocatedTimeMinutes: decision.allocatedTimeMinutes,
          expectedReadyAt: decision.expectedReadyAt,
          priorityReason: decision.priorityReason,
          timelinessStatus: decision.timelinessStatus
        };

        if (activeTask) {
          const updatedTask = await db.task.update({
            where: {
              id: activeTask.id
            },
            data: taskData
          });

          return {
            status: "updated",
            taskId: updatedTask.id,
            assortmentItemId
          };
        }

        const createdTask = await db.task.create({
          data: {
            ...taskData,
            status: TaskStatus.NEW,
            manual: false
          }
        });

        return {
          status: "created",
          taskId: createdTask.id,
          assortmentItemId
        };
      });
    });
  },

  async generateForBranchProduct(
    branchId: string,
    productId: string,
    options?: {
      notify?: boolean;
    }
  ) {
    const assortmentItemId = await planningRepository.findAssortmentItemId(branchId, productId);
    if (!assortmentItemId) {
      return null;
    }

    const result = await this.generateForAssortmentItem(assortmentItemId);

    if (options?.notify !== false && hasTaskGenerationChanges(result)) {
      taskRealtimeService.publishTaskUpdate({
        reason: "generated",
        branchId,
        productId,
        taskId: result.taskId
      });
    }

    return result;
  },

  async generateAll(options?: { notify?: boolean }) {
    const targets = await planningRepository.listPlanningTargets();
    const results: GenerationResult[] = [];

    for (const target of targets) {
      results.push(await this.generateForAssortmentItem(target.id));
    }

    if (options?.notify !== false && results.some((result) => hasTaskGenerationChanges(result))) {
      taskRealtimeService.publishTaskUpdate({
        reason: "bulk-generated"
      });
    }

    return results;
  }
};
