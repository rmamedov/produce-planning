import type { ProductionPlanPriority } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

// A tiny in-memory stand-in for the productionTask table that honours the
// status guards in `where`, so tests can move a task "on another tablet"
// between a service's read and its write.
const db = vi.hoisted(() => {
  const tasks = new Map<string, Row>();
  const hooks: { afterRead: (() => void) | null } = { afterRead: null };

  function matchesValue(actual: unknown, condition: unknown) {
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      if ("in" in condition) return (condition.in as unknown[]).includes(actual);
      if ("not" in condition) return actual !== condition.not;
    }
    return actual === condition;
  }

  function matching(where: Row = {}) {
    return Array.from(tasks.values()).filter((row) =>
      Object.entries(where).every(([key, condition]) => matchesValue(row[key], condition))
    );
  }

  const prisma = {
    productionTask: {
      async findUnique({ where }: { where: { id: string } }) {
        const row = tasks.get(where.id);
        return row ? { ...row } : null;
      },
      async findMany({ where }: { where?: Row }) {
        const rows = matching(where).map((row) => ({ ...row }));
        const hook = hooks.afterRead;
        hooks.afterRead = null;
        hook?.();
        return rows;
      },
      async updateMany({ where, data }: { where: Row; data: Row }) {
        const rows = matching(where);
        for (const row of rows) Object.assign(row, data);
        return { count: rows.length };
      },
      async createMany({ data }: { data: Row[] }) {
        for (const row of data) tasks.set(`created-${tasks.size + 1}`, { ...row });
        return { count: data.length };
      }
    },
    async $transaction(arg: unknown): Promise<unknown> {
      return typeof arg === "function" ? arg(prisma) : Promise.all(arg as Promise<unknown>[]);
    }
  };

  return { tasks, hooks, prisma, publish: vi.fn() };
});

vi.mock("@/lib/prisma", () => ({ prisma: db.prisma }));
vi.mock("@/services/production-tasks/production-task-events", () => ({
  productionTaskEvents: { publish: db.publish }
}));
vi.mock("@/services/silpo/silpo-product.service", () => ({
  resolveLagerInfos: async () => new Map()
}));

import { handleApiError } from "@/api/http";
import { productionTaskGenerationService } from "@/services/production-tasks/production-task-generation.service";
import { productionTaskWorkflowService } from "@/services/production-tasks/production-task-workflow.service";

const historyDate = new Date("2026-09-30T00:00:00.000Z");
const startedElsewhereAt = new Date("2026-09-30T06:40:00.000Z");

function seedTask(id: string, status: string, extra: Row = {}) {
  db.tasks.set(id, {
    id,
    sourceId: `plan-${id}`,
    filialId: 3361,
    departmentId: 1,
    lagerId: 100,
    lagerName: "Круасан",
    lagerUnit: "шт",
    snapshotHour: 10,
    historyDate,
    status,
    priority: "HIGH",
    priorityLevel: 2,
    quantity: 4,
    maxQuantity: 4,
    producedQty: null,
    coveredHours: 1.5,
    reason: "Висока потреба",
    cancelReason: null,
    startedAt: null,
    completedAt: null,
    batchId: null,
    ...extra
  });
}

function planRow(taskId: string, recommendedToProduce: number): ProductionPlanPriority {
  return {
    id: `plan-${taskId}`,
    filialId: 3361,
    departmentId: 1,
    historyDate,
    snapshotHour: 10,
    lagerId: 100,
    lagerFullName: "Круасан",
    priority: 2,
    coveredHours: 1.5,
    currentStockQty: 2,
    demandTillDayEnd: 8,
    demandWholeDay: 12,
    recommendedToProduce,
    salesQty: null,
    producedQty: null,
    demandBeforeQty: 0,
    isGuestPromise: false,
    promoMechanics: null,
    ecomOrdersQty: null,
    bakeryType: null,
    createdAt: historyDate,
    updatedAt: new Date("2026-09-30T07:00:00.000Z")
  };
}

function startOnAnotherTablet(...ids: string[]) {
  for (const id of ids) {
    Object.assign(db.tasks.get(id)!, {
      status: "IN_PROGRESS",
      startedAt: startedElsewhereAt,
      batchId: "tablet-batch"
    });
  }
}

beforeEach(() => {
  db.tasks.clear();
  db.hooks.afterRead = null;
  db.publish.mockClear();
});

describe("productionTaskWorkflowService.start", () => {
  it("starts a NEW task with a fresh batch", async () => {
    seedTask("a", "NEW");

    const task = await productionTaskWorkflowService.start("a");

    expect(task.status).toBe("IN_PROGRESS");
    expect(task.startedAt).toBeInstanceOf(Date);
    expect(task.batchId).toEqual(expect.any(String));
    expect(db.publish).toHaveBeenCalledWith("started");
  });

  it("refuses a task another tablet already started and keeps its batch", async () => {
    seedTask("a", "IN_PROGRESS", { startedAt: startedElsewhereAt, batchId: "tablet-batch" });

    const error = await productionTaskWorkflowService.start("a").catch((caught: unknown) => caught);

    expect(error).toEqual(new Error("only NEW tasks can be started"));
    expect(handleApiError(error).status).toBe(400);
    expect(db.tasks.get("a")).toMatchObject({
      status: "IN_PROGRESS",
      startedAt: startedElsewhereAt,
      batchId: "tablet-batch"
    });
    expect(db.publish).not.toHaveBeenCalled();
  });

  it("reports a missing task as not found", async () => {
    await expect(productionTaskWorkflowService.start("missing")).rejects.toThrow(
      "Production task not found"
    );
  });
});

describe("productionTaskWorkflowService.complete", () => {
  it("completes a NEW task and counts it as started at completion", async () => {
    seedTask("a", "NEW");

    const task = await productionTaskWorkflowService.complete("a", 5);

    expect(task.status).toBe("DONE");
    expect(task.producedQty).toBe(5);
    expect(task.completedAt).toBeInstanceOf(Date);
    expect(task.startedAt).toEqual(task.completedAt);
    expect(db.publish).toHaveBeenCalledWith("completed");
  });

  it("keeps the start time of a task in progress", async () => {
    seedTask("a", "IN_PROGRESS", { startedAt: startedElsewhereAt, batchId: "tablet-batch" });

    const task = await productionTaskWorkflowService.complete("a", null);

    expect(task).toMatchObject({
      status: "DONE",
      producedQty: null,
      startedAt: startedElsewhereAt,
      batchId: "tablet-batch"
    });
  });

  it("refuses a task cancelled on another tablet", async () => {
    seedTask("a", "CANCELLED", { cancelReason: "Немає сировини" });

    await expect(productionTaskWorkflowService.complete("a", 3)).rejects.toThrow(
      "only active tasks can be completed"
    );
    expect(db.tasks.get("a")).toMatchObject({ status: "CANCELLED", producedQty: null, completedAt: null });
    expect(db.publish).not.toHaveBeenCalled();
  });
});

describe("productionTaskWorkflowService.cancel", () => {
  it("cancels a task in progress with the reason", async () => {
    seedTask("a", "IN_PROGRESS", { startedAt: startedElsewhereAt });

    const task = await productionTaskWorkflowService.cancel("a", "Немає сировини");

    expect(task).toMatchObject({ status: "CANCELLED", cancelReason: "Немає сировини" });
    expect(db.publish).toHaveBeenCalledWith("cancelled");
  });

  it("refuses a task completed on another tablet", async () => {
    seedTask("a", "DONE", { producedQty: 4 });

    await expect(productionTaskWorkflowService.cancel("a", "Помилка")).rejects.toThrow(
      "only active tasks can be cancelled"
    );
    expect(db.tasks.get("a")).toMatchObject({ status: "DONE", cancelReason: null });
    expect(db.publish).not.toHaveBeenCalled();
  });
});

describe("productionTaskGenerationService.generateForRows", () => {
  it("refreshes and cancels tasks that are still NEW", async () => {
    seedTask("refresh", "NEW");
    seedTask("drop", "NEW");

    const summary = await productionTaskGenerationService.generateForRows([
      planRow("refresh", 6),
      planRow("drop", 0)
    ]);

    expect(summary).toEqual({ created: 0, updated: 1, cancelled: 1, skipped: 0, unchanged: 0, total: 2 });
    expect(db.tasks.get("refresh")).toMatchObject({ status: "NEW", quantity: 6, maxQuantity: 6 });
    expect(db.tasks.get("drop")).toMatchObject({ status: "CANCELLED", quantity: 0 });
    expect(db.publish).toHaveBeenCalledWith("generated");
  });

  it("leaves tasks a tablet started between the read and the write", async () => {
    seedTask("refresh", "NEW");
    seedTask("drop", "NEW");
    db.hooks.afterRead = () => startOnAnotherTablet("refresh", "drop");

    const summary = await productionTaskGenerationService.generateForRows([
      planRow("refresh", 6),
      planRow("drop", 0)
    ]);

    expect(summary).toEqual({ created: 0, updated: 0, cancelled: 0, skipped: 1, unchanged: 1, total: 2 });
    for (const id of ["refresh", "drop"]) {
      expect(db.tasks.get(id)).toMatchObject({
        status: "IN_PROGRESS",
        quantity: 4,
        startedAt: startedElsewhereAt,
        batchId: "tablet-batch"
      });
    }
    expect(db.publish).not.toHaveBeenCalled();
  });
});
