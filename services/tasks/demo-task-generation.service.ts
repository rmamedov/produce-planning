import { TaskPriority, TaskStatus, TimelinessStatus } from "@prisma/client";
import { addMinutes, subMinutes } from "date-fns";

import { formatTitle } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { assortmentInclude } from "@/repositories/shared";
import { taskRealtimeService } from "@/services/tasks/task-realtime.service";

const DEMO_TASK_COMMENT = "__demo_generated__";
const PRIORITIES = [TaskPriority.CRITICAL, TaskPriority.HIGH, TaskPriority.MEDIUM, TaskPriority.LOW] as const;

type DemoGenerationResult = {
  branchId: string;
  branchName: string;
  productId: string;
  productName: string;
  taskId: string;
  title: string;
  taskStatus: TaskStatus;
  priority: TaskPriority;
  operation: "created";
};

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandomItem<T>(items: T[]) {
  return items[randomInt(0, items.length - 1)];
}

function shuffle<T>(items: T[]) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

function buildPrioritySequence(count: number) {
  const sequence: TaskPriority[] = [];

  while (sequence.length < count) {
    sequence.push(...shuffle([...PRIORITIES]));
  }

  return sequence.slice(0, count);
}

function getPriorityReason(priority: TaskPriority) {
  switch (priority) {
    case TaskPriority.CRITICAL:
      return "Критичний дефіцит по гарячому попиту. Запустити приготування негайно.";
    case TaskPriority.HIGH:
      return "Очікується підвищений попит у найближчий час. Потрібно підготувати партію заздалегідь.";
    case TaskPriority.MEDIUM:
      return "Планове поповнення запасу на найближчий торговий цикл.";
    case TaskPriority.LOW:
      return "Підтримувальна задача для комфортного запасу без ризику дефіциту.";
  }
}

function getAllocatedTimeMinutes(cookingTimeMinutes: number, priority: TaskPriority) {
  const adjustment =
    priority === TaskPriority.CRITICAL ? -5 : priority === TaskPriority.HIGH ? 0 : priority === TaskPriority.MEDIUM ? 5 : 10;

  return Math.max(10, cookingTimeMinutes + adjustment);
}

function getExpectedReadyAt(now: Date, priority: TaskPriority, status: TaskStatus) {
  const minutesFromNow =
    priority === TaskPriority.CRITICAL
      ? randomInt(15, 35)
      : priority === TaskPriority.HIGH
        ? randomInt(35, 60)
        : priority === TaskPriority.MEDIUM
          ? randomInt(60, 110)
          : randomInt(110, 180);

  return status === TaskStatus.IN_PROGRESS ? addMinutes(now, Math.max(10, minutesFromNow - 10)) : addMinutes(now, minutesFromNow);
}

function getHistoryTimeliness(status: TaskStatus) {
  if (status === TaskStatus.CANCELLED) {
    return Math.random() > 0.5 ? TimelinessStatus.ON_TIME : TimelinessStatus.OVERDUE;
  }

  return Math.random() > 0.25 ? TimelinessStatus.ON_TIME : TimelinessStatus.OVERDUE;
}

function getHistoryStatus() {
  return Math.random() > 0.35 ? TaskStatus.DONE : TaskStatus.CANCELLED;
}

function buildQuantity(priority: TaskPriority) {
  switch (priority) {
    case TaskPriority.CRITICAL:
      return randomInt(6, 10);
    case TaskPriority.HIGH:
      return randomInt(4, 8);
    case TaskPriority.MEDIUM:
      return randomInt(3, 6);
    case TaskPriority.LOW:
      return randomInt(2, 4);
  }
}

export const demoTaskGenerationService = {
  async generateFromAdmin(): Promise<DemoGenerationResult[]> {
    const assortments = await prisma.assortment.findMany({
      include: assortmentInclude,
      orderBy: {
        branch: {
          name: "asc"
        }
      }
    });

    const results: DemoGenerationResult[] = [];

    for (const assortment of assortments) {
      if (!assortment.items.length) {
        continue;
      }

      const now = new Date();
      const targetCount = randomInt(5, 8);
      const prioritySequence = buildPrioritySequence(targetCount);

      const branchResults = await prisma.$transaction(async (db) => {
        await db.task.deleteMany({
          where: {
            branchId: assortment.branchId,
            comment: DEMO_TASK_COMMENT
          }
        });

        const existingActiveTasks = await db.task.findMany({
          where: {
            branchId: assortment.branchId,
            status: {
              in: [TaskStatus.NEW, TaskStatus.IN_PROGRESS]
            }
          },
          select: {
            productId: true
          }
        });

        const lockedProductIds = new Set(existingActiveTasks.map((task) => task.productId));
        const availableForActive = shuffle(
          assortment.items.filter((item) => !lockedProductIds.has(item.productId))
        );
        const activeCount = Math.min(availableForActive.length, Math.max(1, Math.min(4, targetCount - 2)));
        const selectedForActive = availableForActive.slice(0, activeCount);
        const branchGenerationResults: DemoGenerationResult[] = [];

        for (const [index, item] of selectedForActive.entries()) {
          const priority = prioritySequence[index];
          const status = Math.random() > 0.3 ? TaskStatus.NEW : TaskStatus.IN_PROGRESS;
          const quantity = buildQuantity(priority);
          const allocatedTimeMinutes = getAllocatedTimeMinutes(
            item.product.technologicalCard?.typicalCookingTimeMinutes ?? 30,
            priority
          );
          const expectedReadyAt = getExpectedReadyAt(now, priority, status);
          const startedAt = status === TaskStatus.IN_PROGRESS ? subMinutes(now, randomInt(5, 20)) : null;
          const task = await db.task.create({
            data: {
              branchId: assortment.branchId,
              productId: item.productId,
              quantity,
              title: formatTitle(item.product.name, quantity),
              status,
              timelinessStatus: TimelinessStatus.ON_TIME,
              priority,
              allocatedTimeMinutes,
              expectedReadyAt,
              priorityReason: getPriorityReason(priority),
              createdAt: startedAt ?? now,
              startedAt,
              manual: false,
              comment: DEMO_TASK_COMMENT
            }
          });

          branchGenerationResults.push({
            branchId: assortment.branchId,
            branchName: assortment.branch.name,
            productId: item.productId,
            productName: item.product.name,
            taskId: task.id,
            title: task.title,
            taskStatus: task.status,
            priority: task.priority,
            operation: "created"
          });
        }

        const historyCount = Math.max(0, targetCount - branchGenerationResults.length);
        const historyStartIndex = branchGenerationResults.length;

        for (let index = 0; index < historyCount; index += 1) {
          const item = pickRandomItem(assortment.items);
          const priority = prioritySequence[historyStartIndex + index];
          const quantity = buildQuantity(priority);
          const status = getHistoryStatus();
          const expectedReadyAt = subMinutes(now, randomInt(30, 240));
          const startedAt = subMinutes(expectedReadyAt, randomInt(15, 45));
          const completedAt = status === TaskStatus.DONE ? addMinutes(expectedReadyAt, randomInt(5, 30)) : null;
          const task = await db.task.create({
            data: {
              branchId: assortment.branchId,
              productId: item.productId,
              quantity,
              title: formatTitle(item.product.name, quantity),
              status,
              timelinessStatus: getHistoryTimeliness(status),
              priority,
              allocatedTimeMinutes: getAllocatedTimeMinutes(
                item.product.technologicalCard?.typicalCookingTimeMinutes ?? 30,
                priority
              ),
              expectedReadyAt,
              priorityReason: getPriorityReason(priority),
              createdAt: startedAt,
              startedAt,
              completedAt,
              manual: false,
              comment: DEMO_TASK_COMMENT
            }
          });

          branchGenerationResults.push({
            branchId: assortment.branchId,
            branchName: assortment.branch.name,
            productId: item.productId,
            productName: item.product.name,
            taskId: task.id,
            title: task.title,
            taskStatus: task.status,
            priority: task.priority,
            operation: "created"
          });
        }

        return branchGenerationResults;
      });

      results.push(...branchResults);
    }

    if (results.length) {
      taskRealtimeService.publishTaskUpdate({
        reason: "bulk-generated"
      });
    }

    return results;
  }
};
