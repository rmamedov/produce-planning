import { randomUUID } from "node:crypto";

import { TaskStatus } from "@prisma/client";

import { HttpError } from "@/api/http";
import { prisma } from "@/lib/prisma";
import { productionTaskRepository } from "@/repositories/production-task.repository";
import { productionTaskEvents } from "@/services/production-tasks/production-task-events";

const ACTIVE_STATUSES: TaskStatus[] = [TaskStatus.NEW, TaskStatus.IN_PROGRESS];
// Only DONE is final: cancelling a cancelled task again just replaces the reason.
const CANCELLABLE_STATUSES: TaskStatus[] = [...ACTIVE_STATUSES, TaskStatus.CANCELLED];

async function requireTask(id: string) {
  const task = await productionTaskRepository.getById(id);
  if (!task) {
    throw new Error("Production task not found");
  }
  return task;
}

/** Splits the requested ids (deduplicated, request order kept) into affected and skipped. */
export function splitByAffected(requested: string[], affected: Iterable<string>) {
  const affectedSet = new Set(affected);
  const unique = Array.from(new Set(requested));
  return {
    affected: unique.filter((id) => affectedSet.has(id)),
    skipped: unique.filter((id) => !affectedSet.has(id))
  };
}

function lagerLabel(task: { lagerName: string | null; lagerId: number }) {
  return task.lagerName ?? `Lager ${task.lagerId}`;
}

export function batchConflictMessage(lagerNames: string[]) {
  const names = Array.from(new Set(lagerNames)).join(", ");
  return `Частину задач уже завершено або скасовано на іншому планшеті: ${names}. Оновіть дошку.`;
}

export interface BatchCompleteItem {
  task_id: string;
  produced_qty: number;
}

export const productionTaskWorkflowService = {
  async start(id: string) {
    const { count } = await prisma.productionTask.updateMany({
      where: { id, status: TaskStatus.NEW },
      data: { status: TaskStatus.IN_PROGRESS, startedAt: new Date(), batchId: randomUUID() }
    });
    if (count === 0) {
      await requireTask(id);
      throw new Error("only NEW tasks can be started");
    }

    productionTaskEvents.publish("started");
    return requireTask(id);
  },

  async complete(id: string, producedQty?: number | null) {
    const completedAt = new Date();
    const completed = await prisma.$transaction(async (tx) => {
      const { count } = await tx.productionTask.updateMany({
        where: { id, status: { in: ACTIVE_STATUSES } },
        data: { status: TaskStatus.DONE, completedAt, producedQty: producedQty ?? null }
      });
      if (count > 0) {
        // Completed straight from NEW: it counts as started when it was finished.
        await tx.productionTask.updateMany({
          where: { id, startedAt: null },
          data: { startedAt: completedAt }
        });
      }
      return count > 0;
    });
    if (!completed) {
      await requireTask(id);
      throw new Error("only active tasks can be completed");
    }

    productionTaskEvents.publish("completed");
    return requireTask(id);
  },

  async cancel(id: string, cancelReason?: string | null) {
    const { count } = await prisma.productionTask.updateMany({
      where: { id, status: { in: CANCELLABLE_STATUSES } },
      data: { status: TaskStatus.CANCELLED, cancelReason: cancelReason ?? null }
    });
    if (count === 0) {
      await requireTask(id);
      throw new Error("only active tasks can be cancelled");
    }

    productionTaskEvents.publish("cancelled");
    return requireTask(id);
  },

  /** Starts every still-NEW task as one batch; tasks another tablet already took are skipped. */
  async startBatch(taskIds: string[]) {
    const batchId = randomUUID();
    const startedIds = await prisma.$transaction(async (tx) => {
      await tx.productionTask.updateMany({
        where: { id: { in: taskIds }, status: TaskStatus.NEW },
        data: { status: TaskStatus.IN_PROGRESS, startedAt: new Date(), batchId }
      });
      // The batch id is fresh, so it marks exactly the rows this update won.
      const started = await tx.productionTask.findMany({ where: { batchId }, select: { id: true } });
      return started.map((task) => task.id);
    });

    const { affected: started, skipped } = splitByAffected(taskIds, startedIds);
    if (started.length) {
      productionTaskEvents.publish("batch-started");
    }
    return { batch_id: started.length ? batchId : null, started, skipped };
  },

  /** Returns IN_PROGRESS tasks to NEW (undo of a start); anything else is skipped. */
  async revertBatch(taskIds: string[]) {
    const revertedIds = await prisma.$transaction(async (tx) => {
      const inProgress = await tx.productionTask.findMany({
        where: { id: { in: taskIds }, status: TaskStatus.IN_PROGRESS },
        select: { id: true }
      });
      if (!inProgress.length) return [];

      const ids = inProgress.map((task) => task.id);
      await tx.productionTask.updateMany({
        where: { id: { in: ids }, status: TaskStatus.IN_PROGRESS },
        data: { status: TaskStatus.NEW, startedAt: null, batchId: null }
      });
      // A task completed or cancelled concurrently keeps its status and is not reported.
      const reverted = await tx.productionTask.findMany({
        where: { id: { in: ids }, status: TaskStatus.NEW },
        select: { id: true }
      });
      return reverted.map((task) => task.id);
    });

    const { affected: reverted, skipped } = splitByAffected(taskIds, revertedIds);
    if (reverted.length) {
      productionTaskEvents.publish("batch-reverted");
    }
    return { reverted, skipped };
  },

  /**
   * All-or-nothing: if any task is gone or no longer active, nothing is
   * written and a 409 names the affected products.
   */
  async completeBatch(items: BatchCompleteItem[]) {
    const completedAt = new Date();
    // Tasks completed straight from NEW get one shared batch so the «Виконані»
    // tab still shows them as produced together.
    const completionBatchId = randomUUID();

    await prisma.$transaction(async (tx) => {
      const ids = items.map((item) => item.task_id);
      const tasks = await tx.productionTask.findMany({ where: { id: { in: ids } } });
      const byId = new Map(tasks.map((task) => [task.id, task]));

      const unavailable = ids.filter((id) => {
        const task = byId.get(id);
        return !task || !ACTIVE_STATUSES.includes(task.status);
      });
      if (unavailable.length) {
        throw new HttpError(
          409,
          batchConflictMessage(
            unavailable.map((id) => {
              const task = byId.get(id);
              return task ? lagerLabel(task) : "невідома задача";
            })
          )
        );
      }

      for (const item of items) {
        const task = byId.get(item.task_id)!;
        // Guarded by status so a completion racing in from another tablet
        // aborts the whole transaction instead of being overwritten.
        const { count } = await tx.productionTask.updateMany({
          where: { id: task.id, status: { in: ACTIVE_STATUSES } },
          data: {
            status: TaskStatus.DONE,
            producedQty: item.produced_qty,
            completedAt,
            startedAt: task.startedAt ?? completedAt,
            batchId: task.batchId ?? completionBatchId
          }
        });
        if (count === 0) {
          throw new HttpError(409, batchConflictMessage([lagerLabel(task)]));
        }
      }
    }, { timeout: 15_000 });

    productionTaskEvents.publish("batch-completed");
    return { completed: items.map((item) => item.task_id) };
  }
};
