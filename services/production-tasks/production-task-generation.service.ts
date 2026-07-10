import type { Prisma, ProductionPlanPriority } from "@prisma/client";
import { TaskStatus } from "@prisma/client";

import { chunk } from "@/lib/concurrency";
import { prisma } from "@/lib/prisma";
import { roundProduceQuantity } from "@/lib/produce-quantity";
import {
  CANCELLED_BY_COVERAGE_REASON,
  decideMutation,
  mapPriorityLevel,
  operationalReadyAtFor,
  resolveNaming
} from "@/lib/task-generation";
import { productionTaskEvents } from "@/services/production-tasks/production-task-events";
import { resolveLagerInfos } from "@/services/silpo/silpo-product.service";

export interface GenerationSummary {
  created: number;
  updated: number;
  cancelled: number;
  skipped: number;
  unchanged: number;
  total: number;
}

// Keep write batches comfortably under transaction limits.
const WRITE_BATCH_SIZE = 500;

export const productionTaskGenerationService = {
  /**
   * Generates (or refreshes) production tasks from the stored production plan
   * priority rows. Optionally scoped to a single filial.
   */
  async generate(filialId?: number): Promise<GenerationSummary> {
    const rows = await prisma.productionPlanPriority.findMany({
      where: filialId ? { filialId } : undefined,
      orderBy: [{ historyDate: "asc" }, { priority: "asc" }, { coveredHours: "asc" }]
    });

    return this.generateForRows(rows);
  },

  /**
   * Generates (or refreshes) production tasks for an explicit set of plan
   * rows — used right after ingest. Optimized for large batches: constant
   * number of DB queries for reads, bulk writes, and Silpo lookups only for
   * SKUs whose name/unit we don't already know (parallel, 3s timeout each).
   */
  async generateForRows(rows: ProductionPlanPriority[]): Promise<GenerationSummary> {
    const summary: GenerationSummary = {
      created: 0,
      updated: 0,
      cancelled: 0,
      skipped: 0,
      unchanged: 0,
      total: rows.length
    };

    if (rows.length === 0) {
      return summary;
    }

    // 1) Existing tasks for these plan rows — one query.
    const existingBySource = new Map(
      (
        await prisma.productionTask.findMany({
          where: { sourceId: { in: rows.map((row) => row.id) } }
        })
      ).map((task) => [task.sourceId, task])
    );

    // 2) Names/units already known from ANY task with the same SKU — one
    //    query. This is a persistent cache: it survives restarts, unlike the
    //    in-memory Silpo cache.
    const lagerIds = Array.from(new Set(rows.map((row) => row.lagerId)));
    const knownName = new Map<number, string>();
    const knownUnit = new Map<number, string>();
    const knownRows = await prisma.productionTask.findMany({
      where: { lagerId: { in: lagerIds } },
      select: { lagerId: true, lagerName: true, lagerUnit: true }
    });
    for (const row of knownRows) {
      if (row.lagerName && !knownName.has(row.lagerId)) knownName.set(row.lagerId, row.lagerName);
      if (row.lagerUnit && !knownUnit.has(row.lagerId)) knownUnit.set(row.lagerId, row.lagerUnit);
    }

    // Names supplied by the forecast itself (V2 lagerfullname).
    const planName = new Map<number, string>();
    for (const row of rows) {
      if (row.lagerFullName && !planName.has(row.lagerId)) {
        planName.set(row.lagerId, row.lagerFullName);
      }
    }

    // 3) Silpo only for SKUs still missing a unit, or missing any name source.
    const needSilpo = lagerIds.filter(
      (id) => !knownUnit.has(id) || (!planName.has(id) && !knownName.has(id))
    );
    const silpo = needSilpo.length
      ? await resolveLagerInfos(needSilpo)
      : new Map<number, { name: string | null; unit: string | null }>();

    // 4) Decide every mutation in memory.
    const creates: Prisma.ProductionTaskCreateManyInput[] = [];
    const updates: Array<{ id: string; data: Prisma.ProductionTaskUncheckedUpdateInput }> = [];
    const cancelIds: string[] = [];

    for (const row of rows) {
      const existing = existingBySource.get(row.id) ?? null;
      const decision = decideMutation(row.recommendedToProduce, existing?.status ?? null);

      if (decision === "skip") {
        summary.skipped += 1;
        continue;
      }
      if (decision === "unchanged") {
        summary.unchanged += 1;
        continue;
      }
      if (decision === "cancel") {
        cancelIds.push(existing!.id);
        summary.cancelled += 1;
        continue;
      }

      const info = silpo.get(row.lagerId);
      const lagerName = resolveNaming({
        plan: row.lagerFullName,
        known: knownName.get(row.lagerId),
        silpo: info?.name,
        existing: existing?.lagerName
      });
      const lagerUnit = resolveNaming({
        known: knownUnit.get(row.lagerId),
        silpo: info?.unit,
        existing: existing?.lagerUnit
      });
      const { priority, reason } = mapPriorityLevel(row.priority);
      const quantity = roundProduceQuantity(row.recommendedToProduce, lagerUnit);
      const operationalReadyAt = operationalReadyAtFor(row.updatedAt, row.coveredHours);

      if (decision === "create") {
        creates.push({
          sourceId: row.id,
          filialId: row.filialId,
          departmentId: row.departmentId,
          lagerId: row.lagerId,
          lagerName,
          lagerUnit,
          snapshotHour: row.snapshotHour,
          historyDate: row.historyDate,
          status: TaskStatus.NEW,
          priority,
          priorityLevel: row.priority,
          quantity,
          coveredHours: row.coveredHours,
          currentStockQty: row.currentStockQty,
          operationalReadyAt,
          reason
        });
        summary.created += 1;
      } else {
        updates.push({
          id: existing!.id,
          data: {
            status: TaskStatus.NEW,
            priority,
            priorityLevel: row.priority,
            quantity,
            coveredHours: row.coveredHours,
            currentStockQty: row.currentStockQty,
            reason,
            lagerName,
            lagerUnit,
            snapshotHour: row.snapshotHour,
            departmentId: row.departmentId,
            operationalReadyAt
          }
        });
        summary.updated += 1;
      }
    }

    // 5) Write in bulk, chunked so a huge ingest doesn't build one giant
    //    transaction.
    if (creates.length) {
      for (const batch of chunk(creates, WRITE_BATCH_SIZE)) {
        await prisma.productionTask.createMany({ data: batch });
      }
    }
    if (cancelIds.length) {
      await prisma.productionTask.updateMany({
        where: { id: { in: cancelIds } },
        data: { status: TaskStatus.CANCELLED, quantity: 0, reason: CANCELLED_BY_COVERAGE_REASON }
      });
    }
    if (updates.length) {
      for (const batch of chunk(updates, WRITE_BATCH_SIZE)) {
        await prisma.$transaction(
          batch.map((update) =>
            prisma.productionTask.update({ where: { id: update.id }, data: update.data })
          )
        );
      }
    }

    // Notify connected boards once per batch if anything actually changed.
    if (summary.created || summary.updated || summary.cancelled) {
      productionTaskEvents.publish("generated");
    }

    return summary;
  }
};
